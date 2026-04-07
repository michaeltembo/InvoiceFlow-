

const currency = localStorage.getItem("currency") || "ZMW";
const rates = {
  USD:1,
  EUR:0.92,
  GBP:0.79,
  ZMW:27
};

// =============================
// GLOBAL CONFIG
// =============================

function getCurrency() {
  return window.COMPANY?.currency || "ZMW";
}

function formatMoney(amount){

  const currency = (window.COMPANY && window.COMPANY.currency) || "ZMW";

  return new Intl.NumberFormat("en-ZM", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2
  }).format(amount || 0);
}


// =============================
// INIT
// =============================

document.addEventListener("DOMContentLoaded", async () => {
  try {

    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login.html";
      return;
    }

    const filterEl = document.getElementById("dateFilter");
    if (filterEl) {
      filterEl.addEventListener("change", loadDashboard);
    }

    // ✅ STEP 1: load company
    await loadCompany();

    // ✅ STEP 2: render header
    renderCompanyHeader();

    // ✅ STEP 3: 🔥 LOAD CLIENTS (ADDED HERE)
    try {
      await loadClients();
    } catch (err) {
      console.error("Clients failed:", err);
    }

    // ✅ STEP 4: 🔥 LOAD INVITATIONS (KEEP THIS)
    try {
      await loadInvitations();
    } catch (err) {
      console.error("Invitations failed:", err);
    }

    // ✅ STEP 5: other UI
    initSearch();

    // ✅ STEP 6: dashboard
    await loadDashboard();

    setInterval(loadDashboard, 30000);

  } catch (err) {
    console.error("🔥 INIT FAILED:", err);
  }
});


// =============================
// MAIN DASHBOARD
// =============================
async function loadDashboard() {

  try {


    startKPISkeleton();

    const token = localStorage.getItem("token");
    const filter = document.getElementById("dateFilter")?.value || "month";

    const [invRes, clientRes] = await Promise.all([
      fetch("/invoices", { headers:{ Authorization:"Bearer " + token } }),
      fetch("/clients", { headers:{ Authorization:"Bearer " + token } })
    ]);

    const invData = await invRes.json();
    const clientData = await clientRes.json();

    const invoices = invData.data || invData || [];
    const clients = Array.isArray(clientData) ? clientData : clientData.data || [];

    // =============================
    // PREP
    // =============================
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    const monthlyRevenue = Object.fromEntries(months.map(m => [m, 0]));
    const monthlyOutstanding = Object.fromEntries(months.map(m => [m, 0]));

    let revenue = 0;
    let outstanding = 0;

    // =============================
    // MAIN LOOP
    // =============================
    invoices.forEach(inv => {

      const rawDate = inv.created_at || inv.date || inv.createdAt;
      const date = rawDate ? new Date(rawDate) : null;
      if (!date || isNaN(date)) return;

      const now = new Date();

      // FILTER
      if (filter === "month") {
        if (date.getMonth() !== now.getMonth() ||
            date.getFullYear() !== now.getFullYear()) return;
      }

      if (filter === "year") {
        if (date.getFullYear() !== now.getFullYear()) return;
      }

      // AMOUNT CLEAN
      let rawAmount = inv.total ?? inv.amount ?? 0;

      if (typeof rawAmount === "string") {
        rawAmount = rawAmount.replace(/[^\d.-]/g, "");
      }

      const amount = Number(rawAmount) || 0;

      const status = String(inv.status || "").toLowerCase();
      const month = months[date.getMonth()];

      if (status === "paid") {
        revenue += amount;
        monthlyRevenue[month] += amount;
      } else {
        outstanding += amount;
        monthlyOutstanding[month] += amount;
      }

    });

    // =============================
    // KPI TEXT
    // =============================
    setText("totalClients", clients.length);
    setText("activeClients", clients.filter(c => c.status === "active").length);
    setText("outstandingRevenue", formatMoney(outstanding));

    const revenueEl = document.getElementById("totalRevenue");
    if (revenueEl) {
      const predicted = predictNextRevenue(monthlyRevenue);
      revenueEl.innerHTML = `
        <div>${formatMoney(revenue)}</div>
        <div style="font-size:11px;color:#6b7280;">
          Next: ${formatMoney(predicted)}
        </div>
      `;
    }

    // =============================
    // CHARTS
    // =============================
    drawSparkline("clientsSpark", Object.values(monthlyRevenue));
    drawSparkline("revenueSpark", Object.values(monthlyRevenue));
    drawSparkline("outstandingSpark", Object.values(monthlyOutstanding));
    drawRevenueChart(monthlyRevenue);

    // =============================
    // TABLE + LIST
    // =============================
    renderRecentInvoices(invoices);
    renderTopClients(invoices);

    // =============================
    // KPI TRENDS
    // =============================
    updateKPIs(invoices);

    stopKPISkeleton();

  } catch (err) {
    console.error("🔥 Dashboard crashed:", err);
    stopKPISkeleton();
  }
}

// =============================
// KPI TRENDS
// =============================
function updateKPIs(invoices){

  const now = new Date();
  const cm = now.getMonth();
  const cy = now.getFullYear();

  const lastDate = new Date(cy, cm - 1, 1);
  const lm = lastDate.getMonth();
  const ly = lastDate.getFullYear();

  let currentRevenue = 0, lastRevenue = 0;
  let currentOutstanding = 0, lastOutstanding = 0;

  invoices.forEach(inv => {

    const rawDate = inv.created_at || inv.date || inv.createdAt;
    const date = rawDate ? new Date(rawDate) : null;
    if (!date || isNaN(date)) return;

    let amount = inv.total ?? inv.amount ?? 0;

    if (typeof amount === "string") {
      amount = amount.replace(/[^\d.-]/g, "");
    }

    amount = Number(amount) || 0;

    const status = String(inv.status || "").toLowerCase();

    const isCurrent = date.getMonth() === cm && date.getFullYear() === cy;
    const isLast = date.getMonth() === lm && date.getFullYear() === ly;

    if (isCurrent) {
      if (status === "paid") currentRevenue += amount;
      else currentOutstanding += amount;
    }

    if (isLast) {
      if (status === "paid") lastRevenue += amount;
      else lastOutstanding += amount;
    }

  });

  setTrend("totalRevenueCard", calc(currentRevenue, lastRevenue));
  setTrend("outstandingCard", calc(currentOutstanding, lastOutstanding));
}

// =============================
// TREND UI
// =============================
function setTrend(cardId, value){

  const card = document.getElementById(cardId);
  if (!card) return;

  const trend = card.querySelector(".trend");
  if (!trend) return;

  trend.className = "trend";

  if (value === 0){
    trend.textContent = "→ 0%";
    return;
  }

  if (value > 0){
    trend.classList.add("up");
    trend.textContent = `▲ +${value}%`;
  } else {
    trend.classList.add("down");
    trend.textContent = `▼ ${Math.abs(value)}%`;
  }
}

// =============================
// CHARTS
// =============================

let revenueChart;

function drawRevenueChart(monthlyRevenue){

  const canvas = document.getElementById("revenueChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  // destroy old chart
  if (revenueChart) revenueChart.destroy();

  const labels = Object.keys(monthlyRevenue);
  const data = Object.values(monthlyRevenue);

  // 🌈 PREMIUM GRADIENT
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, "rgba(79, 70, 229, 0.35)");
  gradient.addColorStop(0.5, "rgba(79, 70, 229, 0.15)");
  gradient.addColorStop(1, "rgba(79, 70, 229, 0.02)");

  revenueChart = new Chart(ctx, {
    type: "line",

    data: {
      labels,
      datasets: [{
        label: "Revenue",
        data,

        // 🎯 LINE STYLE
        borderColor: "#4f46e5",
        borderWidth: 3,
        tension: 0.45,

        // 🌈 FILL
        backgroundColor: gradient,
        fill: true,

        // 🔵 POINTS
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: "#4f46e5",
        pointBorderColor: "#ffffff",
        pointBorderWidth: 2,

        // ✨ SMOOTH ENTRY ANIMATION
        segment: {
          borderColor: ctx => "#4f46e5"
        }
      }]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      // 🎬 ANIMATION (VERY IMPORTANT)
      animation: {
        duration: 1200,
        easing: "easeOutQuart"
      },

      interaction: {
        mode: "index",
        intersect: false
      },

      plugins: {
        legend: {
          display: false
        },

        // 💎 PREMIUM TOOLTIP
        tooltip: {
          backgroundColor: "#111827",
          titleColor: "#fff",
          bodyColor: "#e5e7eb",
          borderColor: "#4f46e5",
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: function(context){
              return "Revenue: " + formatMoney(context.parsed.y);
            }
          }
        }
      },

      // 📊 AXES (CLEAN SAAS STYLE)
      scales: {

        x: {
          grid: {
            display: false
          },
          ticks: {
            color: "#6b7280",
            font: {
              size: 12,
              weight: "500"
            }
          }
        },

        y: {
          beginAtZero: true,

          grid: {
            color: "rgba(0,0,0,0.05)"
          },

          ticks: {
            color: "#6b7280",
            padding: 8,
            callback: function(value){
              return formatMoney(value);
            }
          }
        }
      }
    }
  });
}

function drawSparkline(id, data){

  const canvas = document.getElementById(id);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (canvas.chart) canvas.chart.destroy();

  canvas.chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map((_, i) => i),
      datasets: [{
        data: data,
        borderWidth: 2,
        tension: 0.4
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { x:{display:false}, y:{display:false} }
    }
  });
}

// =============================
// TABLE
// =============================
function renderRecentInvoices(invoices){

  const table = document.getElementById("invoiceTable");
  if (!table) return;

  table.innerHTML = "";

  invoices
    .sort((a,b)=> new Date(b.created_at) - new Date(a.created_at))
    .slice(0,5)
    .forEach(inv => {

      table.insertAdjacentHTML("beforeend", `
        <tr>
          <td>#${inv.id || "-"}</td>
          <td>${inv.client_name || "-"}</td>
          <td>${inv.status || "-"}</td>
          <td>${formatMoney(inv.total)}</td>
        </tr>
      `);

    });
}

// =============================
// TOP CLIENTS
// =============================
function renderTopClients(invoices){

  const list = document.getElementById("topClients");
  if (!list) return;

  const totals = {};

  invoices.forEach(inv => {

    if (String(inv.status).toLowerCase() !== "paid") return;

    const client = inv.client_name || "Unknown";

    totals[client] = (totals[client] || 0) + Number(inv.total || 0);

  });

  const top = Object.entries(totals)
    .sort((a,b)=> b[1] - a[1])
    .slice(0,5);

  list.innerHTML = top.map(([name,total]) => `
    <li style="display:flex;justify-content:space-between;">
      <span>${name}</span>
      <strong>${formatMoney(total)}</strong>
    </li>
  `).join("");
}


// =============================
// SEARCH (CLEANED)
// =============================

function initSearch(){

  const container = document.getElementById("searchContainer");
  const icon = document.getElementById("searchIcon");
  const input = document.getElementById("globalSearch");
  const results = document.getElementById("searchResults");

  if (!container || !icon || !input || !results) return;

  // =============================
  // 🔍 TOGGLE OPEN
  // =============================
  icon.addEventListener("click", () => {
    container.classList.add("active");
    input.focus();
  });

  // =============================
  // 🔒 CLOSE ON OUTSIDE CLICK
  // =============================
  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) {
      container.classList.remove("active");
      results.style.display = "none";
      input.value = "";
    }
  });

  const suggestions = [
    { name:"Dashboard", link:"dashboard.html" },
    { name:"Clients", link:"clients.html" },
    { name:"Invoices", link:"invoices.html" },
    { name:"Settings", link:"company-settings.html" },

    { name:"Total Clients", section:"totalClientsCard" },
    { name:"Active Clients", section:"activeClientsCard" },
    { name:"Total Revenue", section:"totalRevenueCard" },
    { name:"Outstanding", section:"outstandingCard" },
    { name:"Revenue Overview", section:"revenueChartSection" },
    { name:"Recent Invoices", section:"recentInvoices" }
  ];

  // =============================
  // 🔍 SEARCH INPUT
  // =============================
  input.addEventListener("input", function(){

    const term = this.value.toLowerCase().trim();
    results.innerHTML = "";

    if (!term){
      results.style.display = "none";
      return;
    }

    const matches = suggestions.filter(item =>
      item.name.toLowerCase().includes(term)
    );

    if (!matches.length){
      results.style.display = "none";
      return;
    }

    matches.forEach(match => {

      const div = document.createElement("div");
      div.className = "search-item";
      div.textContent = match.name;

      div.onclick = () => {

        input.value = match.name;
        results.style.display = "none";

        if (match.link){
          window.location.href = match.link;
        }

        if (match.section){
          const section = document.getElementById(match.section);
          if (section){
            section.scrollIntoView({ behavior:"smooth" });
          }
        }
      };

      results.appendChild(div);
    });

    results.style.display = "block";
  });

  // =============================
  // ⌨️ ENTER SUPPORT
  // =============================
  input.addEventListener("keypress", function(e){
    if (e.key === "Enter"){
      const first = results.querySelector(".search-item");
      if (first) first.click();
    }
  });
}


// =============================
// HELPERS
// =============================
function setText(id, value){
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function calc(current, previous){
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function predictNextRevenue(monthlyRevenue){
  const values = Object.values(monthlyRevenue);
  const last = values[values.length - 1] || 0;
  return last * 1.1;
}

// =============================
// SKELETON
// =============================
function startKPISkeleton(){

  document.querySelectorAll(".kpi-card, .card").forEach(card=>{
    card.classList.add("skeleton-card");
  });

}


function stopKPISkeleton(){

  document.querySelectorAll(".skeleton-text, .skeleton-box")
    .forEach(el=>{
      el.classList.remove("skeleton-text","skeleton-box");
    });

  document.querySelectorAll(".skeleton-card")
    .forEach(el=>{
      el.classList.remove("skeleton-card");
    });

}









function renderCompanyHeader(retries = 5) {

  const nameEl = document.getElementById("companyNameDisplay");
  const currencyEl = document.getElementById("companyCurrency");

  const logoEl = document.getElementById("companyHeaderLogo");
  const initialsEl = document.getElementById("companyInitials");

  // DROPDOWN (optional if still exists)
  const menuImg = document.getElementById("profileMenuImg");
  const menuName = document.getElementById("profileMenuName");
  const menuCurrency = document.getElementById("profileMenuCurrency");

  if ((!nameEl || !currencyEl) && retries > 0) {
    setTimeout(() => renderCompanyHeader(retries - 1), 200);
    return;
  }

  if (!nameEl || !currencyEl) return;

  const data = window.COMPANY || company || {};

  console.log("🎯 Rendering:", data);

  const name = data.name || data.company_name || "InvoiceFlow";

  // ✅ HEADER TEXT
  nameEl.textContent = name;
  currencyEl.textContent = "ZMW";

  // =============================
  // ✅ AVATAR LOGIC (MAIN FIX)
  // =============================

  if (data.logo && logoEl) {
    // 🔥 SHOW IMAGE
    logoEl.src = "/uploads/" + data.logo;
    logoEl.style.display = "block";

    if (initialsEl) initialsEl.style.display = "none";

  } else {
    // 🔥 SHOW INITIALS
    if (logoEl) logoEl.style.display = "none";

if (initialsEl) {
  initialsEl.style.display = "flex";

  const initials = name
    .split(" ")
    .map(w => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  initialsEl.textContent = initials;

  // 🔥 ADD COLOR HERE
  const colors = ["#4f46e5","#059669","#dc2626","#ea580c","#0891b2"];
  initialsEl.style.background = colors[name.length % colors.length];
}

  }

  // =============================
  // OPTIONAL DROPDOWN SYNC
  // =============================

  const logoSrc = data.logo
    ? "/uploads/" + data.logo
    : "/images/default-avatar.png";

  if (menuImg) menuImg.src = logoSrc;
  if (menuName) menuName.textContent = name;
  if (menuCurrency) menuCurrency.textContent = "ZMW";
}


// =============================
// LOAD COMPANY PROFILE
// =============================
async function loadCompany() {
  try {
    const token = localStorage.getItem("token");

    const res = await fetch("/company-settings", {
      headers: { Authorization: "Bearer " + token }
    });

const data = await res.json();
data.currency = "ZMW";

    console.log("🔥 COMPANY:", data);

    window.COMPANY = data || {};
    company = data || {}; // ✅ ADD THIS

  } catch (err) {
    console.error("❌ Company load failed:", err);
    window.COMPANY = {};
    company = {};
  }
}


async function loadInvitations(){
  const container = document.getElementById("invitationList");
  if (!container) return;

  container.innerHTML = "<p>Loading invitations...</p>";

  try {

    const token = localStorage.getItem("token");

    if (!token){
      container.innerHTML = "<p>Please login again</p>";
      return;
    }

    const res = await fetch("/invitations", {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    // 🔥 HANDLE NON-JSON SAFELY
    let data = {};
    try {
      data = await res.json();
    } catch {
      container.innerHTML = "<p>Server error</p>";
      return;
    }

    if (!res.ok){
      console.error("❌ API ERROR:", data);
      container.innerHTML = `<p>${data.error || "Failed to load invitations"}</p>`;
      return;
    }

    const invites = data.data || [];

    if (!invites.length){
      container.innerHTML = `<p>No invitations</p>`;
      return;
    }

    container.innerHTML = invites.map(inv => {

      const inviteLink = inv.token
        ? `${window.location.origin}/accept-invite.html?token=${inv.token}`
        : null;

      return `
        <div class="invite-card">
          <div>
            <strong>${inv.email}</strong><br>
            <small>${inv.role} • ${inv.status}</small>
          </div>

          <div style="display:flex;gap:8px;">
            ${
              inviteLink
                ? `<button onclick="copyInvite('${inviteLink}')">Copy Link</button>`
                : `<span style="color:#9ca3af;">No link</span>`
            }

            <button onclick="deleteInvite(${inv.id})">Cancel</button>
          </div>
        </div>
      `;
    }).join("");

  } catch (err){
    console.error("🔥 LOAD INVITES CRASH:", err);
    container.innerHTML = "<p>Error loading invitations</p>";
  }
}

async function acceptInvite() {
  const token = new URLSearchParams(window.location.search).get("token");

  if (!token) {
    alert("Invalid invitation link");
    return;
  }

  const res = await fetch("/invitations/accept", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify({ token })
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.error || "Failed to accept invitation");
    return;
  }

  alert("✅ Joined company!");
  window.location.href = "dashboard.html";
}


async function declineInvite(id) {
  const token = localStorage.getItem("token");

  await fetch(`/invitations/${id}/decline`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token }
  });

  loadInvitations();
}









function toggleLogoMenu(e){
  e.stopPropagation();

  const menu = document.getElementById("logoMenu");
  if (!menu) return;

  menu.style.display = menu.style.display === "block" ? "none" : "block";
}

// CLOSE WHEN CLICK OUTSIDE
document.addEventListener("click", function(){
  const menu = document.getElementById("logoMenu");
  if (menu) menu.style.display = "none";
});








function openProfile(){

  const data = window.COMPANY || {};

  document.getElementById("profileModal").style.display = "flex";

  document.getElementById("profileModalImg").src =
    data.logo ? "/uploads/" + data.logo : "/images/default-avatar.png";

  document.getElementById("profileModalName").textContent =
    data.name || data.company_name || "Company";

  document.getElementById("profileModalCurrency").textContent = "ZMW";

  document.getElementById("profileEmail").textContent = data.email || "-";
  document.getElementById("profilePhone").textContent = data.phone || "-";
  document.getElementById("profileCountry").textContent = data.country || "-";
  document.getElementById("profileAddress").textContent = data.address || "-";

  document.getElementById("profileBank").textContent = data.bank_name || "-";
  document.getElementById("profileAccount").textContent = data.account_number || "-";
  document.getElementById("profileBranch").textContent = data.branch || "-";
  document.getElementById("profileSwift").textContent = data.swift || "-";
  document.getElementById("profileMobileMoney").textContent = data.mobile_money || "-";
}

function closeProfile(){
  document.getElementById("profileModal").style.display = "none";
}






/* ===============================
INVITE MODAL
=============================== */
window.openInviteModal = function(){
  const modal = document.getElementById("inviteModal");
  if (!modal) {
    console.error("❌ inviteModal not found");
    return;
  }
  modal.classList.add("open");
};

window.closeInviteModal = function(){
  const modal = document.getElementById("inviteModal");
  if (!modal) return;
  modal.classList.remove("open");
};

/* ===============================
SEND INVITE
=============================== */
async function sendInvite(){
  try {
    const email = document.getElementById("inviteEmail").value.trim();
    const role = document.getElementById("inviteRole").value;

    if (!email) {
      alert("Email required");
      return;
    }

    const res = await fetch("/invitations", {
      method: "POST",
      headers: getJSONHeaders(),
      body: JSON.stringify({ email, role })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to send invite");
      return;
    }

    alert("Invitation sent ✅");

    closeInviteModal();
    loadInvitations();

  } catch (err) {
    console.error("Invite error:", err);
    alert("Something went wrong");
  }
}


function copyInvite(link){
  navigator.clipboard.writeText(link);
  alert("Invite link copied!");
}


async function deleteInvite(id){
  if (!confirm("Cancel invitation?")) return;

  await fetch(`/invitations/${id}`, {
    method: "DELETE",
    headers: getJSONHeaders()
  });

  loadInvitations();
}


