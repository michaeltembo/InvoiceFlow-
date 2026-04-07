

function formatDate(date){
  if (!date) return "-";

  const d = new Date(date);

  if (isNaN(d)) return "-";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(d);
}


let activeClient = null;

const currency = localStorage.getItem("currency") || "ZMW";

const rates = {
  USD:1,
  EUR:0.92,
  GBP:0.79,
  ZMW:27
};

function formatMoney(amount){
  return new Intl.NumberFormat("en-US",{
    style:"currency",
    currency: currency
  }).format(amount);
}


/* ===============================
GLOBAL STATE
=============================== */

let allClients = [];
let filteredClients = [];
let currentCurrency = "USD";


/* ===============================
AUTH
=============================== */

function getJSONHeaders(){
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };
}

function getAuthHeaders(){
  const token = localStorage.getItem("token");
  return {
    "Authorization": `Bearer ${token}`
  };
}

/* ===============================
INIT
=============================== */
document.addEventListener("DOMContentLoaded", () => {
  loadClients();
});

/* ===============================
LOAD CLIENTS (FULL FIX)
=============================== */

async function loadClients(){
  try{
    startKPISkeleton();
    showTableSkeleton();

    await new Promise(res => setTimeout(res, 200));

    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "login.html";
      return;
    }

    const res = await fetch("/clients", {
      method: "GET",
      headers: getJSONHeaders()
    });

    const data = await res.json();

    console.log("CLIENT API RESPONSE:", data);

    if (!res.ok) {
      console.error("Clients fetch failed:", data);
      stopKPISkeleton();
      return;
    }

    // ✅ STRONG PARSER
    const rawClients = Array.isArray(data)
      ? data
      : Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.clients)
      ? data.clients
      : Array.isArray(data.results)
      ? data.results
      : [];

    console.log("PARSED CLIENTS:", rawClients);

    if (!rawClients.length) {
      console.warn("⚠️ No clients returned from API");
    }

    allClients = rawClients;
    filteredClients = [...rawClients];

    renderClients();

    // KPIs
    const total = rawClients.length;
    const active = rawClients.filter(c => (c.status || "").toLowerCase() === "active").length;
    const inactive = total - active;

    setText("totalClients", total);
    setText("activeClients", active);
    setText("inactiveClients", inactive);

    // invoices
    const invRes = await fetch("/invoices", {
      headers: getJSONHeaders()
    });

    const invData = await invRes.json();

    if (!invRes.ok) {
      console.error("Invoices fetch failed:", invData);
      stopKPISkeleton();
      return;
    }

    const invoices = invData.data || invData || [];

    updateClientKPIs(rawClients, invoices);

    await new Promise(res => setTimeout(res, 300));
    stopKPISkeleton();

  } catch(err){
    console.error("🔥 LOAD ERROR:", err);

    setText("totalClients", 0);
    setText("activeClients", 0);
    setText("inactiveClients", 0);
    setText("totalRevenue", formatMoney(0)); // ✅ FIXED

    stopKPISkeleton();
  }
}
/* ===============================
RENDER TABLE
=============================== */

function renderClients(){

  const tbody = document.getElementById("clientsTableBody");
  tbody.innerHTML = "";

  // ✅ APPLY PAGINATION HERE
  const paginated = filteredClients;

  paginated
    .filter(client => client.name)
    .forEach(client => {

      const row = document.createElement("tr");

      row.innerHTML = `


<td class="client-cell">
  ${client.avatar
    ? `<img
        src="/uploads/${client.avatar}"
        class="client-avatar"
        onclick="event.stopPropagation(); openImage('/uploads/${client.avatar}')"
      >`
    : `<div class="client-avatar placeholder">${client.name.charAt(0).toUpperCase()}</div>`
  }
  <span>${client.name}</span>
</td>

        <td>${client.email || "-"}</td>
        <td>${client.phone || "-"}</td>
        <td>${client.country || "-"}</td>
        <td>${formatMoney(client.total_revenue || 0)}</td>

        <td>
          <span class="status-badge status-${client.status || "active"}">
            ${client.status || "active"}
          </span>
        </td>

        <td>${client.invoice_count || 0}</td>

        <td class="actions">
          <button class="icon-btn" onclick="editClient('${client.id}')">✏️</button>
          <button class="icon-btn delete-btn"
            onclick="event.stopPropagation(); deleteClient(${client.id})">🗑</button>
        </td>
      `;

      row.addEventListener("click", () => openDrawer(client));
      tbody.appendChild(row);
    });

  // ✅ RENDER PAGINATION BUTTONS (VERY IMPORTANT)
  renderPagination(filteredClients);
}

/* ===============================
ADD CLIENT
=============================== */

async function addClient(){

  try {

    const name = document.getElementById("clientName").value.trim();
    const email = document.getElementById("clientEmail").value.trim();
    const phone = document.getElementById("clientPhone").value.trim();
    const country = document.getElementById("clientCountry").value.trim();

    const file = document.getElementById("clientAvatar").files[0];

    if (!name) {
      alert("Client name required");
      return;
    }

    const formData = new FormData();

    formData.append("name", name);
    formData.append("email", email);
    formData.append("phone", phone);
    formData.append("country", country);

    if (file) {
      formData.append("avatar", file);
    }

    const res = await fetch("/clients", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      },
      body: formData
    });

    const data = await res.json();

    // 🔴 VERY IMPORTANT
    if (!res.ok) {
      alert(data.error || "Failed to save client");
      return;
    }

    console.log("✅ CLIENT SAVED:", data);

    // ✅ RESET FORM PROPERLY
    document.getElementById("clientForm").reset();

    // ✅ ALSO CLEAR FILE INPUT (CRITICAL)
    document.getElementById("clientAvatar").value = "";

    closeClientModal();
    loadClients();

  } catch (err) {
    console.error("ADD CLIENT ERROR:", err);
    alert("Something went wrong");
  }
}


/* ===============================
DELETE
=============================== */
async function deleteClient(id){
  if(!confirm("Delete client?")) return;

  await fetch(`/clients/${id}`,{
    method:"DELETE",
    headers: getAuthHeaders()
  });

  loadClients();
}

/* ===============================
EDIT
=============================== */
function editClient(id){

  const client = allClients.find(c => c.id === id);
  if(!client) return;

  document.getElementById("clientName").value = client.name;
  document.getElementById("clientEmail").value = client.email;
  document.getElementById("clientPhone").value = client.phone;
  document.getElementById("clientCountry").value = client.country;

  openClientModal();
}

/* ===============================
SEARCH
=============================== */

function searchClients(term){

  if (!allClients.length) return;

  currentPage = 1;

  term = term.toLowerCase().trim();

  filteredClients = allClients.filter(c =>
    (c.name || "").toLowerCase().includes(term) ||
    (c.email || "").toLowerCase().includes(term)
  );

  renderClients();
}

/* ===============================
DRAWER
=============================== */
async function openDrawer(client){

window.currentClient = client;
activeClient = client;

  const drawer = document.getElementById("clientDrawer");
  drawer.classList.add("open");

document.body.style.overflow = "hidden"; // lock background

  // =============================
  // BASIC INFO
  // =============================
  document.getElementById("drawerClientName").textContent = client.name;
  document.getElementById("drawerEmail").textContent = client.email || "-";
  document.getElementById("drawerPhone").textContent = client.phone || "-";
  document.getElementById("drawerCountry").textContent = client.country || "-";

// =============================
// 🔥 STATUS (ELITE)
// =============================
const statusEl = document.getElementById("drawerClientStatus");

if (statusEl) {
  const status = (client.status || "active").toLowerCase();

  statusEl.textContent =
    status === "active" ? "Active Client" :
    status === "inactive" ? "Inactive Client" :
    "Pending Client";

  statusEl.className = ""; // reset
  statusEl.classList.add(`status-${status}`);
}

// =============================
// 🔥 AVATAR (CLEAN + PRO)
// =============================
const avatar = document.getElementById("drawerAvatar");

if (avatar) {

  // If client has uploaded image
  if (client.avatar) {

    avatar.innerHTML = `
      <img src="/uploads/${client.avatar}" 
           style="width:100%;height:100%;object-fit:cover;border-radius:50%;">
    `;

  } else {

    // Generate initials
    const name = client.name || "C";

    const initials = name
      .split(" ")
      .map(w => w[0])
      .join("")
      .substring(0,2)
      .toUpperCase();

    const colors = ["#4f46e5","#059669","#dc2626","#ea580c","#0891b2"];

    avatar.innerHTML = initials;

    avatar.style.background = colors[name.length % colors.length];
    avatar.style.color = "#fff";
    avatar.style.display = "flex";
    avatar.style.alignItems = "center";
    avatar.style.justifyContent = "center";
    avatar.style.fontWeight = "600";
    avatar.style.fontSize = "18px";
  }
}


  // =============================
  // LOADING STATE (NEW)
  // =============================
  document.getElementById("drawerInvoicesTable").innerHTML =
    `<tr><td colspan="4">Loading...</td></tr>`;

  try {

    const token = localStorage.getItem("token");

    const res = await fetch("/invoices", {
      headers: { Authorization: "Bearer " + token }
    });

    const data = await res.json();

    const invoices =
      data.data ||
      data.invoices ||
      data.results ||
      data ||
      [];

    // =============================
    // 🔥 SAFE FILTER (USE ID IF EXISTS)
    // =============================
    const clientInvoices = invoices.filter(inv =>
      inv.client_id == client.id ||
      (inv.client_name || "").toLowerCase() === client.name.toLowerCase()
    );

    // =============================
    // CALCULATE STATS
    // =============================
    let paid = 0;
    let pending = 0;
    let revenue = 0;

    clientInvoices.forEach(inv => {

      const amount = Number(inv.total || 0);

      revenue += amount;

      if ((inv.status || "").toLowerCase() === "paid") paid += amount;
      else pending += amount;

    });


// =============================
// 🔥 FIX AVG + LAST ACTIVITY
// =============================

// ✅ AVG INVOICE
const avg = clientInvoices.length > 0
  ? revenue / clientInvoices.length
  : 0;

const avgEl = document.getElementById("avgInvoice");
if (avgEl) avgEl.textContent = formatMoney(avg);

// ✅ LAST ACTIVITY (use latest invoice AFTER sort)
const sortedInvoices = [...clientInvoices].sort(
  (a, b) => new Date(b.created_at) - new Date(a.created_at)
);

const last = sortedInvoices[0];

const lastEl = document.getElementById("lastActivity");
if (lastEl) {
  lastEl.textContent = last
    ? formatDate(last.created_at)
    : "-";
}


// =============================
// 🔥 ELITE CHART (DOUGHNUT + CENTER TOTAL)
// =============================
const ctx = document.getElementById("drawerRevenueChart");

if (ctx && typeof Chart !== "undefined") {

  if (window.drawerChart) window.drawerChart.destroy();

  const safePaid = Number(paid || 0);
  const safePending = Number(pending || 0);
  const total = safePaid + safePending;

  const centerTextPlugin = {
    id: "centerText",
    beforeDraw(chart) {
      const { width, height, ctx } = chart;

      ctx.save();

      // 🔹 TOP LABEL (small)
      ctx.font = "500 12px sans-serif";
      ctx.fillStyle = "#6b7280";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Total Revenue", width / 2, height / 2 - 10);

      // 🔹 MAIN VALUE (bold)
      ctx.font = "700 16px sans-serif";
      ctx.fillStyle = "#111827";
      ctx.fillText(formatMoney(total), width / 2, height / 2 + 10);

      ctx.restore();
    }
  };

  window.drawerChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Paid", "Pending"],
      datasets: [{
        data: [safePaid, safePending],
        backgroundColor: ["#22c55e", "#f59e0b"],
        borderWidth: 0,
        hoverOffset: 8 // 🔥 smoother hover
      }]
    },
    options: {
      cutout: "75%", // 🔥 cleaner center space
      responsive: true,
      maintainAspectRatio: false,

      animation: {
        animateRotate: true,
        duration: 800 // 🔥 smooth SaaS animation
      },

      plugins: {
        legend: {
          position: "bottom",
          labels: {
            padding: 16,
            usePointStyle: true,
            font: {
              size: 12
            }
          }
        },

        tooltip: {
          backgroundColor: "#111827",
          titleColor: "#fff",
          bodyColor: "#e5e7eb",
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => {
              const value = ctx.raw || 0;
              const percent = total
                ? ((value / total) * 100).toFixed(1)
                : 0;

              return `${ctx.label}: ${formatMoney(value)} (${percent}%)`;
            }
          }
        }
      }
    },

    plugins: [centerTextPlugin]
  });
}
    // =============================
    // 🔥 TIMELINE (LIMITED + SORTED)
    // =============================

const timeline = document.getElementById("drawerTimeline");

if (timeline) {

  const sorted = (clientInvoices || [])
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 6);

  timeline.innerHTML = sorted.length
    ? sorted.map(inv => {

        const status = (inv.status || "").toLowerCase();

        const statusColor =
          status === "paid" ? "#22c55e" :
          status === "pending" ? "#f59e0b" :
          "#6b7280";

        return `
          <div class="timeline-item">
            <div class="timeline-dot"></div>

            <div class="timeline-content">
              <div style="display:flex;justify-content:space-between;">
                <strong>Invoice #${inv.id || "-"}</strong>
                <span style="font-weight:600;">
                  ${formatMoney(inv.total || 0)}
                </span>
              </div>

              <small style="color:${statusColor};font-weight:500;">
                ${status.toUpperCase() || "UNKNOWN"}
              </small>

              <div style="font-size:12px;color:#9ca3af;">
                ${inv.created_at
                  ? new Date(inv.created_at).toLocaleDateString()
                  : "-"}
              </div>
            </div>
          </div>
        `;
    }).join("")
    : `<p style="color:#9ca3af;">No activity</p>`;
}

    // =============================
    // STATS
    // =============================
    document.getElementById("drawerRevenue").textContent = formatMoney(revenue);
    document.getElementById("drawerInvoicesCount").textContent = clientInvoices.length;
    document.getElementById("drawerPaid").textContent = formatMoney(paid);
    document.getElementById("drawerPending").textContent = formatMoney(pending);

    // =============================
    // TABLE
    // =============================

const table = document.getElementById("drawerInvoicesTable");

if (table) {

  const safeInvoices = Array.isArray(clientInvoices)
    ? clientInvoices
    : [];

  if (!safeInvoices.length) {
    table.innerHTML = `<tr><td colspan="4">No invoices</td></tr>`;
  } else {
    table.innerHTML = safeInvoices.map(inv => {

      const status = (inv.status || "").toLowerCase();

      const statusClass =
        status === "paid" ? "status-paid" :
        status === "pending" ? "status-pending" :
        "status-default";

      return `
        <tr>
          <td>#${inv.id || "-"}</td>
          <td>${
            inv.created_at
              ? new Date(inv.created_at).toLocaleDateString()
              : "-"
          }</td>
          <td>${formatMoney(inv.total || 0)}</td>
          <td class="${statusClass}">
            ${status.toUpperCase() || "UNKNOWN"}
          </td>
        </tr>
      `;
    }).join("");
  }
}

} catch (err) {

    console.error("Drawer invoice error:", err);

    const table = document.getElementById("drawerInvoicesTable");
    if (table) {
      table.innerHTML =
        `<tr><td colspan="4">Error loading invoices</td></tr>`;
    }
  }
}


function closeDrawer(){
  document.getElementById("clientDrawer").classList.remove("open");
document.body.style.overflow = "auto"; // unlock background

}

/* ===============================
MODAL
=============================== */
function openClientModal(){
  document.getElementById("clientModal").classList.add("open");
}

function closeClientModal(){
  document.getElementById("clientModal").classList.remove("open");


}

/* ===============================
HELPERS
=============================== */
function setText(id, value){
  const el = document.getElementById(id);
  if(el) el.textContent = value ?? 0;
}

function calc(current, last){
  if (last === 0) return current > 0 ? 100 : 0;
  return ((current - last) / last) * 100;
}

/* ===============================
KPI TREND
=============================== */
function setTrend(el, value){
  if (!el) return;

  const v = Math.round(value);

  if (v > 0){
    el.className = "kpi-trend up";
    el.innerHTML = `<i data-lucide="arrow-up-right"></i> +${v}%`;
  }
  else if (v < 0){
    el.className = "kpi-trend down";
    el.innerHTML = `<i data-lucide="arrow-down-right"></i> ${v}%`;
  }
  else {
    el.className = "kpi-trend neutral";
    el.innerHTML = `<i data-lucide="minus"></i> 0%`;
  }

  // 🔥 re-render icons after update
  lucide.createIcons();
}


/* ===============================
KPIs (FINAL FIX)
=============================== */
function updateClientKPIs(clients = [], invoices = []){

  if (!Array.isArray(clients)) clients = [];
  if (!Array.isArray(invoices)) invoices = [];

  const now = new Date();
  const cm = now.getMonth();
  const cy = now.getFullYear();

  const lmDate = new Date(cy, cm - 1, 1);
  const lm = lmDate.getMonth();
  const ly = lmDate.getFullYear();

  let cc=0, lc=0, ca=0, la=0;

  // =========================
  // CLIENT CALCULATIONS
  // =========================
  clients.forEach(c=>{
    const d = new Date(c.created_at || Date.now());
    const active = (c.status || "").toLowerCase() === "active";

    if(!isNaN(d)){
      if(d.getMonth()===cm && d.getFullYear()===cy){
        cc++; if(active) ca++;
      }
      if(d.getMonth()===lm && d.getFullYear()===ly){
        lc++; if(active) la++;
      }
    }
  });

  const ci = cc - ca;
  const li = lc - la;

  // =========================
  // INVOICE / REVENUE
  // =========================
  let total=0, cr=0, lr=0;

  invoices.forEach(inv=>{
    const amt = Number(inv.total) || 0;
    total += amt;

    const d = new Date(inv.created_at || inv.date || Date.now());

    if(!isNaN(d)){
      if(d.getMonth()===cm && d.getFullYear()===cy) cr+=amt;
      if(d.getMonth()===lm && d.getFullYear()===ly) lr+=amt;
    }
  });

  // =========================
  // SAFE DOM SETTER
  // =========================
  function set(id, value){
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // =========================
  // MAIN KPI VALUES (🔥 FIXED)
  // =========================
  set("totalClients", clients.length);
  set("activeClients", clients.filter(c => (c.status||"").toLowerCase()==="active").length);
  set("inactiveClients", clients.filter(c => (c.status||"").toLowerCase()!=="active").length);
  set("totalRevenue", formatMoney(total)); // ✅ FIXED ID

  // =========================
  // TREND CALC
  // =========================
  function calc(curr, last){
    if (last === 0 && curr === 0) return 0;
    if (last === 0 && curr > 0) return 100;
    return ((curr - last) / last) * 100;
  }

  // =========================
  // SAFE TREND SETTER
  // =========================
  function safeTrend(id, value){
    const el = document.getElementById(id);
    if (el && typeof setTrend === "function"){
      setTrend(el, value);
    }
  }

  safeTrend("clientsTrend", calc(cc, lc));
  safeTrend("activeTrend", calc(ca, la));
  safeTrend("inactiveTrend", calc(ci, li));
  safeTrend("revenueTrend", calc(cr, lr));
}






function showTableSkeleton(){

  const tbody = document.getElementById("clientsTableBody");
  if(!tbody) return;

  tbody.innerHTML = "";

  for(let i = 0; i < 6; i++){

    const row = document.createElement("tr");
    row.className = "skeleton-row";

    row.innerHTML = `
      <td>
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-box" style="width:120px;"></div>
        </div>
      </td>
      <td><div class="skeleton-box" style="width:150px;"></div></td>
      <td><div class="skeleton-box" style="width:120px;"></div></td>
      <td><div class="skeleton-box" style="width:100px;"></div></td>
      <td><div class="skeleton-box" style="width:90px;"></div></td>
      <td><div class="skeleton-box" style="width:80px;"></div></td>
      <td><div class="skeleton-box" style="width:60px;"></div></td>
      <td><div class="skeleton-box" style="width:70px;"></div></td>
    `;

    tbody.appendChild(row);
  }
}


function stopSkeleton(){
  const tbody = document.getElementById("clientsTableBody");
  if(tbody) tbody.innerHTML = "";
}




let currentPage = 1;
const rowsPerPage = 5;

function paginate(data){
  const totalPages = Math.ceil(data.length / rowsPerPage);

  // ✅ prevent invalid page
  if(currentPage > totalPages) currentPage = totalPages || 1;

  const start = (currentPage - 1) * rowsPerPage;
  return data.slice(start, start + rowsPerPage);
}


function renderPagination(data){
  const container = document.getElementById("pagination");
  if(!container) return;

  container.innerHTML = "";

  const totalPages = Math.ceil(data.length / rowsPerPage);

  // ✅ prevent rendering when no data
  if(totalPages <= 1) return;

  for(let i=1;i<=totalPages;i++){
    const btn = document.createElement("button");
    btn.className = "page-btn";

    if(i === currentPage) btn.classList.add("active");

    btn.innerText = i;

    btn.onclick = ()=>{
      currentPage = i;
      renderClients();
    };

    container.appendChild(btn);
  }
}



/* ===============================
SKELETON CONTROL
=============================== */

function startClientSkeleton(){
  document.querySelectorAll(".kpi-card").forEach(card=>{
    card.classList.add("loading");
  });
}

function stopClientSkeleton(){
  document.querySelectorAll(".kpi-card").forEach(card=>{
    card.classList.remove("loading");
    card.classList.add("fade-in"); // 🔥 premium effect
  });
}



function startKPISkeleton(){

  // existing KPI skeleton
  document.querySelectorAll(".kpi-card").forEach(card=>{
    card.classList.add("skeleton-card");
  });

  document.querySelectorAll(".kpi-number, .kpi-title, .kpi-trend").forEach(el=>{
    el.classList.add("skeleton-text");
  });

  document.querySelectorAll(".kpi-icon").forEach(icon=>{
    icon.classList.add("skeleton-box");
  });

  // 👉 ADD THIS (page header)
  document.getElementById("pageTitle")?.classList.add("skeleton-text");
  document.getElementById("pageSubtitle")?.classList.add("skeleton-text");

// ADD THESE LINES
document.querySelector(".search-input")?.classList.add("skeleton-input");
document.querySelector(".primary-btn")?.classList.add("skeleton-button");

}

function stopKPISkeleton(){

  document.querySelectorAll(".kpi-card").forEach(card=>{
    card.classList.remove("skeleton-card");
  });

  document.querySelectorAll(".kpi-number, .kpi-title, .kpi-trend").forEach(el=>{
    el.classList.remove("skeleton-text");
  });

  document.querySelectorAll(".kpi-icon").forEach(icon=>{
    icon.classList.remove("skeleton-box");
  });

  // 👉 REMOVE header skeleton
  document.getElementById("pageTitle")?.classList.remove("skeleton-text");
  document.getElementById("pageSubtitle")?.classList.remove("skeleton-text");

// REMOVE skeleton
document.querySelector(".search-input")?.classList.remove("skeleton-input");
document.querySelector(".primary-btn")?.classList.remove("skeleton-button");

}





// company.js (or top of dashboard.js)

let COMPANY = null;

async function loadCompany() {
  try {
    const token = localStorage.getItem("token");

    const res = await fetch("/company-settings", {
      headers: { Authorization: "Bearer " + token }
    });

    COMPANY = await res.json();
    window.COMPANY = COMPANY;

    localStorage.setItem("company_cache", JSON.stringify(COMPANY));

  } catch (err) {
    console.error("Company load failed:", err);

    const cached = localStorage.getItem("company_cache");
    if (cached) {
      COMPANY = JSON.parse(cached);
      window.COMPANY = COMPANY;
    }
  }
}






function openImage(src){
  const modal = document.getElementById("imageModal");
  const img = document.getElementById("modalImage");

  img.src = src;
  modal.style.display = "flex";
}

// click anywhere to close
document.getElementById("imageModal").addEventListener("click", () => {
  document.getElementById("imageModal").style.display = "none";
});







function editClientFromDrawer(){
  if (!activeClient) return;
  editClient(activeClient.id);
}

function deleteClientFromDrawer(){
  if (!activeClient) return;
  deleteClient(activeClient.id);
}

function sendInvoice(){
  if (!activeClient) return;

  // Example: redirect with client pre-filled
  window.location.href = `create-invoice.html?client_id=${activeClient.id}`;
}

function exportClientReport(){
  if (!activeClient) return;

  alert("Exporting report for " + activeClient.name);
  // you can later generate PDF / CSV here
}
