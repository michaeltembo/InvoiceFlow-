

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

    await loadCompany();

    renderCompanyHeader();

    try {
      await loadClients();
    } catch (err) {
      console.error("Clients failed:", err);
    }

    try {
      await loadInvitations();
    } catch (err) {
      console.error("Invitations failed:", err);
    }

    initKPITooltips();
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

const now = new Date();
const cm = now.getMonth();
const cy = now.getFullYear();

const lastDate = new Date();
lastDate.setMonth(cm - 1);

const lm = lastDate.getMonth();
const ly = lastDate.getFullYear();

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


if (!window.clientSpotlightStarted) {
  startClientSpotlight(clients);
  window.clientSpotlightStarted = true;
}


renderTopClients(invoices, clients);




    // =============================
    // PREP
    // =============================

const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ✅ KEEP for chart
const monthlyRevenue = Object.fromEntries(months.map(m => [m, 0]));
const monthlyOutstanding = Object.fromEntries(months.map(m => [m, 0]));

// 🔥 ADD for sparks + prediction
const monthlyRevenueArr = Array(12).fill(0);
const monthlyOutstandingArr = Array(12).fill(0);

const monthlyClientsArr = Array(12).fill(0); // ✅ CLIENT SPARK DATA
const monthlyActiveArr = Array(12).fill(0);

let revenue = 0;
let outstandingTotal = 0;


    // =============================
    // MAIN LOOP
    // =============================
    invoices.forEach(inv => {

      const rawDate = inv.created_at || inv.date || inv.createdAt;
      const date = rawDate ? new Date(rawDate) : null;
      if (!date || isNaN(date.getTime())) return;


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
      const m = date.getMonth();
      const month = months[m];

if (status === "paid") {
  revenue += amount;

  monthlyRevenue[month] += amount;
  monthlyRevenueArr[m] += amount;

} else {
  outstandingTotal += amount;

  monthlyOutstanding[month] += amount;
  monthlyOutstandingArr[m] += amount;
}


    });


updateHeaderDescription(
  revenue,
  outstandingTotal,
  clients.length,
  monthlyRevenueArr,
  monthlyOutstandingArr
);


// ✅ KPI CARDS (ANIMATED - CLEAN)
const totalRevEl = document.getElementById("totalRevenue");
const outRevEl = document.getElementById("outstandingRevenue");
const paidEl = document.getElementById("paidRevenue");
const outBreakEl = document.getElementById("outstandingBreakdown");

setTimeout(() => {

  if (totalRevEl) animateCount(totalRevEl, revenue, 1200, true);
  if (outRevEl) animateCount(outRevEl, outstandingTotal, 1200, true);

  // keep breakdown consistent (also animated)
  if (paidEl) animateCount(paidEl, revenue, 1000, true);
  if (outBreakEl) animateCount(outBreakEl, outstandingTotal, 1000, true);

}, 200);
// =============================
// CLIENTS (CORRECT TREND LOGIC)
// =============================
let currentClients = 0;
let lastClients = 0;
let currentActive = 0;
let lastActive = 0;

clients.forEach(c => {

  const rawDate =
    c.created_at ||
    c.createdAt ||
    c.date ||
    c.created ||
    null;

  if (!rawDate) return;

  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return;

  const isActive = String(c.status || "")
    .toLowerCase()
    .trim() === "active";

  const m = d.getMonth();

  // ✅ ADD THIS (YOU WERE MISSING IT)
  monthlyClientsArr[m] += 1;

  if (isActive) {
    monthlyActiveArr[m] += 1;
  }

  const isCurrent =
    d.getMonth() === cm && d.getFullYear() === cy;

  const isLast =
    d.getMonth() === lm && d.getFullYear() === ly;

  if (isCurrent){
    currentClients++;
    if (isActive) currentActive++;
  }

  if (isLast){
    lastClients++;
    if (isActive) lastActive++;
  }

});

generateInsights(monthlyClientsArr, monthlyRevenueArr);

const activeCount = clients.filter(c =>
  (c.status || "").toLowerCase().trim() === "active"
).length;

updateKPITooltips(
  revenue,
  outstandingTotal,
  clients.length,
  monthlyRevenueArr,
  activeCount // ✅ ADD THIS
);


const predictedRevenue = predictNextRevenue(monthlyRevenueArr);

// clone + add prediction point
const forecastData = [...monthlyRevenueArr, predictedRevenue];



    // =============================
    // KPI TEXT
    // =============================
    animateCount(document.getElementById("totalClients"), clients.length);
animateCount(
  document.getElementById("activeClients"),
  clients.filter(c => (c.status || "").toLowerCase() === "active").length
);

const revenueEl = document.getElementById("totalRevenue");

if (revenueEl) {
  const predicted = predictNextRevenue(monthlyRevenueArr);

if (revenueEl) {
  revenueEl.innerHTML = `
    <div id="revenueValue"></div>
    <div style="font-size:11px;color:#6b7280;">
      Forecast: ${formatMoney(predicted)}
    </div>
  `;

  animateCount(
    document.getElementById("revenueValue"),
    revenue,
    1200,
    true
  );
}

}


document.getElementById("revenuePrediction").innerText =
  generateRevenueInsight(revenue, predictedRevenue);


    // =============================
    // KPI TRENDS
    // =============================


// ✅ REMOVE LOADING FIRST
removeSkeletons();
stopKPISkeleton();

// ✅ DELAY ENSURES DOM IS READY
setTimeout(() => {

  drawSparkline("clientsSpark", safeData(monthlyClientsArr));
  drawSparkline("activeSpark", safeData(monthlyActiveArr));
  drawSparkline("revenueSpark", safeData(monthlyRevenueArr));
  drawSparkline("outstandingSpark", safeData(monthlyOutstandingArr));

  drawRevenueChart(monthlyRevenue);

  renderRecentInvoices(invoices, clients);

  updateKPIs(invoices, clients);

}, 50);


  } catch (err) {
    console.error("🔥 Dashboard crashed:", err);
    stopKPISkeleton();
  }
}


function generateRevenueInsight(current, predicted){

  if (predicted > current){
    return "📈 Revenue expected to grow next period";
  }

  if (predicted < current){
    return "⚠️ Possible revenue slowdown detected";
  }

  return "Stable revenue trend";
}




function startClientSpotlight(clients){

  const activeClients = clients.filter(c =>
    (c.status || "").toLowerCase() === "active"
  );

  if (!activeClients.length) return;

  let index = 0;

  const imageEl = document.getElementById("clientSpotlightImage");
  const nameEl = document.getElementById("clientSpotlightName");
  const emailEl = document.getElementById("clientSpotlightEmail");

function showClient(i){

  const client = activeClients[i];

  const hasValidAvatar =
    client.avatar &&
    client.avatar !== "null" &&
    client.avatar.trim() !== "";

  const avatarUrl = hasValidAvatar
    ? `/uploads/${client.avatar}`
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(client.name || "Client")}&background=6366f1&color=fff`;

  // 🔥 SAFE IMAGE LOAD (prevents black)
  const img = new Image();

  img.onload = () => {
    imageEl.style.backgroundImage = `url(${avatarUrl})`;
  };

  img.onerror = () => {
    imageEl.style.backgroundImage =
      `url("https://ui-avatars.com/api/?name=${encodeURIComponent(client.name || "Client")}&background=6366f1&color=fff")`;
  };

  img.src = avatarUrl;

  nameEl.textContent = client.name || "Unnamed Client";
  emailEl.textContent = client.email || "";
}

  // FIRST LOAD
  showClient(index);

  // 🔁 AUTO CYCLE
  setInterval(() => {
    index = (index + 1) % activeClients.length;
    showClient(index);
  }, 4000); // every 4s
}

// =============================
// KPI TRENDS (FULL - FIXED)
// =============================
function updateKPIs(invoices, clients){

  const now = new Date();
  const cm = now.getMonth();
  const cy = now.getFullYear();

const lastDate = new Date(cy, cm - 1, 1);
const lm = lastDate.getMonth();
const ly = lastDate.getFullYear();


  let currentRevenue = 0, lastRevenue = 0;
  let currentOutstanding = 0, lastOutstanding = 0;

  let currentClients = 0, lastClients = 0;
  let currentActive = 0, lastActive = 0;

  // =============================
  // INVOICES (REVENUE)
  // =============================
  invoices.forEach(inv => {

    const d = new Date(inv.created_at || inv.date || inv.createdAt || 0);
    if (isNaN(d.getTime())) return;

    let amount = inv.total ?? inv.amount ?? 0;

    if (typeof amount === "string") {
      amount = amount.replace(/[^\d.-]/g, "");
    }

    amount = Number(amount) || 0;

    const status = String(inv.status || "").toLowerCase();

    const isCurrent = d.getMonth() === cm && d.getFullYear() === cy;
    const isLast = d.getMonth() === lm && d.getFullYear() === ly;

    if (isCurrent) {
      if (status === "paid") currentRevenue += amount;
      else currentOutstanding += amount;
    }

    if (isLast) {
      if (status === "paid") lastRevenue += amount;
      else lastOutstanding += amount;
    }

  });

  // =============================
  // CLIENTS (GROWTH)
  // =============================

clients.forEach(c => {

  const rawDate = c.created_at || c.createdAt || c.date || c.created || null;
  const d = rawDate ? new Date(rawDate) : null;
  if (!d || isNaN(d.getTime())) return; // ✅ fixed

  const isActive = String(c.status || "").toLowerCase().trim() === "active";

const m = d.getMonth();


  if (d.getMonth() === cm && d.getFullYear() === cy) {
    currentClients++;
    if (isActive) currentActive++;
  }

  if (d.getMonth() === lm && d.getFullYear() === ly) {
    lastClients++;
    if (isActive) lastActive++;
  }
});

  // =============================
  // APPLY TO KPI CARDS (MATCH IDS)
  // =============================

setTrend("clientsTrend", currentClients, lastClients);
setTrend("activeTrend", currentActive, lastActive);
setTrend("revenueTrend", currentRevenue, lastRevenue);
setTrend("outstandingTrend", currentOutstanding, lastOutstanding);

}
// =============================
// TREND UI
// =============================

function setTrend(elId, current, previous){
const el = document.getElementById(elId);
if (!el) return;

if (previous === 0){
  el.innerHTML = current > 0 ? "↑ 100%" : "0%";
  el.style.color = current > 0 ? "#16a34a" : "#6b7280";
  return;
}


  const change = ((current - previous) / previous) * 100;
  const rounded = change.toFixed(1);

  if (change > 0){
    el.innerHTML = `↑ ${rounded}%`;
    el.style.color = "#16a34a";
  } else if (change < 0){
    el.innerHTML = `↓ ${Math.abs(rounded)}%`;
    el.style.color = "#dc2626";
  } else {
    el.innerHTML = "0%";
    el.style.color = "#6b7280";
  }
}

// =============================
// CHARTS
// =============================

let revenueChart;


function drawRevenueChart(monthlyRevenue) {

  const canvas = document.getElementById("revenueChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (revenueChart) revenueChart.destroy();

  const actualData = Object.values(monthlyRevenue);

  const predicted = predictNextRevenue(actualData);

  const labels = [...Object.keys(monthlyRevenue), "Next"];

  const forecastData = [...actualData, predicted];

  // 🌈 PREMIUM GRADIENT
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, "rgba(79, 70, 229, 0.35)");
  gradient.addColorStop(0.5, "rgba(79, 70, 229, 0.15)");
  gradient.addColorStop(1, "rgba(79, 70, 229, 0.02)");

  revenueChart = new Chart(ctx, {
    type: "line",


data: {
  labels: labels, // make sure this is your extended labels

  datasets: [

    // ✅ ACTUAL DATA
    {
      label: "Revenue",
      data: actualData,
      borderColor: "#4f46e5",
      borderWidth: 3,
      tension: 0.45,
      backgroundColor: gradient,
      fill: true,
      pointRadius: 4
    },

    // 🔥 PREDICTION LINE
    {
      label: "Prediction",
      data: forecastData,
      borderColor: "#f59e0b",
      borderDash: [6,6],
      borderWidth: 2,
      tension: 0.45,
      fill: false,
      pointRadius: 0
    }

  ]
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


function safeData(arr){
  if (!arr || arr.length === 0) return [0];

  const max = Math.max(...arr);

  // ✅ force visibility
  if (max === 0) {
    return arr.map((_, i) => i % 2); // tiny variation
  }

  return arr;
}

function drawSparkline(id, data){

  const canvas = document.getElementById(id);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (canvas.chart) canvas.chart.destroy();

  // 🎨 PREMIUM SAAS COLOR SYSTEM
  const styles = {
    clientsSpark: {
      line: "#6366f1", // indigo
      top: "rgba(99,102,241,0.45)",
      bottom: "rgba(99,102,241,0.02)"
    },
    activeSpark: {
      line: "#10b981", // green
      top: "rgba(16,185,129,0.45)",
      bottom: "rgba(16,185,129,0.02)"
    },
    revenueSpark: {
      line: "#3b82f6", // blue
      top: "rgba(59,130,246,0.45)",
      bottom: "rgba(59,130,246,0.02)"
    },
    outstandingSpark: {
      line: "#ef4444", // red
      top: "rgba(239,68,68,0.45)",
      bottom: "rgba(239,68,68,0.02)"
    }
  };

  const style = styles[id] || styles.revenueSpark;

  // 🌈 GRADIENT
  const gradient = ctx.createLinearGradient(0, 0, 0, 60);
  gradient.addColorStop(0, style.top);
  gradient.addColorStop(1, style.bottom);

  canvas.chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map((_, i) => i),
      datasets: [{
        data: data,
        borderColor: style.line,
        borderWidth: 2.5,
        tension: 0.45,
        fill: true,
        backgroundColor: gradient,
        pointRadius: 0,
        cubicInterpolationMode: "monotone",
        // ✨ subtle glow (premium feel)
        borderCapStyle: "round",
        borderJoinStyle: "round"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,

      animation: {
        duration: 900,
        easing: "easeOutQuart"
      },

      plugins: {
        legend: { display: false }
      },

      scales: {
        x: { display: false },
        y: { display: false }
      },

      elements: {
        line: {
          borderCapStyle: "round"
        }
      }
    }
  });
}



// =============================
// TABLE
// =============================


function renderRecentInvoices(invoices, clients){

  const tbody = document.getElementById("invoiceTable");
  if (!tbody) return;

  const clientMap = {};
  clients.forEach(c => {
    if (c.name) {
      clientMap[c.name.trim().toLowerCase()] = c;
    }
  });

  const latest = [...invoices]
    .sort((a,b) => new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0))
    .slice(0,5);

  tbody.innerHTML = latest.map(inv => {

    const rawStatus = (inv.status || "").toLowerCase().trim();

    let status = "pending";
    if (rawStatus === "paid") status = "paid";
    else if (rawStatus === "overdue") status = "overdue";

    const statusLabel =
      status === "paid" ? "Paid" :
      status === "overdue" ? "Overdue" :
      "Pending";

    const name = inv.client_name || "Unknown";

    const client =
      clientMap[name.trim().toLowerCase()] ||
      clients.find(c =>
        (c.name || "").toLowerCase().includes(name.toLowerCase())
      ) ||
      {};

    const hasValidAvatar =
      client.avatar &&
      client.avatar !== "null" &&
      client.avatar.trim() !== "";

    const imageUrl =
      hasValidAvatar
        ? `/uploads/${client.avatar}`
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;

    return `
      <tr class="invoice-row" onclick="window.openInvoice && openInvoice(${inv.id})">

        <td class="invoice-id-cell">
          <div class="invoice-icon">📄</div>
          <span>#${inv.id}</span>
        </td>

        <td class="invoice-client-cell">
          <img
            src="${imageUrl}"
            class="invoice-avatar"
            onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff'"
          />
          <span>${name}</span>
        </td>

        <td>
          <span class="status-badge status-${status}">
            ${statusLabel}
          </span>
        </td>

        <td class="invoice-total right">
          ${formatMoney(inv.total || 0)}
        </td>

      </tr>
    `;
  }).join("");
}

// =============================
// TOP CLIENTS
// =============================

function renderTopClients(invoices, clients){

  const list = document.getElementById("topClients");
  if (!list) return;

  const totals = {};

  invoices.forEach(inv => {

    const status = String(inv.status || "").toLowerCase();

    if (status !== "paid" && status !== "pending") return;

    const clientName =
      inv.client_name ||
      inv.client ||
      "Unknown";

    totals[clientName] = (totals[clientName] || 0) + Number(inv.total || 0);

  });

  // 🔥 ADD THIS BLOCK (clientMap)
  const clientMap = {};

  clients.forEach(c => {
    if (c.name) {
      clientMap[c.name.trim().toLowerCase()] = c;
    }
  });

  const top = Object.entries(totals)
    .sort((a,b)=> b[1] - a[1])
    .slice(0,5);

  if (!top.length){
    list.innerHTML = `<li>No data</li>`;
    return;
  }

  list.innerHTML = top.map(([name,total], index) => {

    // 🔥 USE clientMap HERE
    const client = clientMap[name.trim().toLowerCase()] || {};

    const hasValidAvatar =
      client.avatar &&
      client.avatar !== "null" &&
      client.avatar.trim() !== "";

    const avatarUrl = hasValidAvatar
      ? `/uploads/${client.avatar}`
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;

return `
  <li class="top-client-item">

    <div class="top-client-left">

      <div class="top-client-avatar-wrapper">
        <img
          src="${avatarUrl}"
          class="top-client-avatar"
          onerror="this.onerror=null; this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff'"
        />

        <!-- 🔥 REVENUE BADGE -->
        <span class="client-badge">
          ${formatMoney(total)}
        </span>
      </div>

<span class="top-client-name">
  ${name}
  ${
    index === 0 ? '<span class="medal gold">🥇</span>' :
    index === 1 ? '<span class="medal silver">🥈</span>' :
    index === 2 ? '<span class="medal bronze">🥉</span>' :
    ''
  }
</span>


    </div>

    <strong class="top-client-amount">
      ${formatMoney(total)}
    </strong>

  </li>
`;

  }).join("");
}

// =============================
// SEARCH (CLEANED)
// =============================

function initSearch(){

const input = document.getElementById("globalSearch");
const results = document.getElementById("searchResults");

if (!input || !results) return;

const suggestions = [

// Pages  
{ name:"Dashboard", link:"dashboard.html" },  
{ name:"Clients", link:"clients.html" },  
{ name:"Invoices", link:"invoices.html" },  
{ name:"Settings", link:"company-settings.html" },  

// Sections  
{ name:"Total Clients", section:"totalClientsCard" },  
{ name:"Active Clients", section:"activeClientsCard" },  
{ name:"Total Revenue", section:"totalRevenueCard" },  
{ name:"Outstanding", section:"outstandingCard" },  
{ name:"Revenue Overview", section:"revenueChartSection" },  
{ name:"Recent Invoices", section:"recentInvoices" }

];

// INPUT SEARCH
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
  div.textContent = match.name;  
  div.style.padding = "8px";  
  div.style.cursor = "pointer";  

  div.onclick = () => {  

    input.value = match.name;  
    results.style.display = "none";  

    // Navigate  
    if (match.link){  
      window.location.href = match.link;  
    }  

    // Scroll  
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

// ENTER KEY SUPPORT
input.addEventListener("keypress", function(e){
if (e.key === "Enter"){
const first = results.querySelector("div");
if (first) first.click();
}
});

// CLICK OUTSIDE CLOSE
document.addEventListener("click", function(e){
if (!input.contains(e.target) && !results.contains(e.target)){
results.style.display = "none";
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


function initKPITooltips(){

  const tooltip = document.getElementById("kpiTooltip");
  if (!tooltip) return;

  document.querySelectorAll(".kpi-card").forEach(card => {

    card.addEventListener("mousemove", (e) => {
      const text = card.getAttribute("data-tooltip");
      if (!text) return;

      tooltip.innerText = text;

      tooltip.style.left = e.clientX + 12 + "px";
      tooltip.style.top = e.clientY + 12 + "px";

      tooltip.classList.add("show");
    });

    card.addEventListener("mouseleave", () => {
      tooltip.classList.remove("show");
    });

  });
}


// =============================
// CALCULATE TREND PERCENTAGE
// =============================
function calc(current, previous) {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return 100; // from 0 to some number => 100%
  return ((current - previous) / previous) * 100;
}

function predictNextRevenue(data){

  // remove zero-only data
  const clean = data.filter(v => v > 0);

  if (clean.length < 3){
    return clean[clean.length - 1] || 0;
  }

  // 📈 Linear regression (trend-based prediction)
  const n = clean.length;

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

  clean.forEach((y, i) => {
    sumX += i;
    sumY += y;
    sumXY += i * y;
    sumXX += i * i;
  });

  const slope =
    (n * sumXY - sumX * sumY) /
    (n * sumXX - sumX * sumX);

  const intercept = (sumY - slope * sumX) / n;

  const nextIndex = n;

  const prediction = slope * nextIndex + intercept;

  return Math.max(0, prediction);
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










function generateInsights(monthlyClientsArr, monthlyRevenueArr) {

  const now = new Date();
  const cm = now.getMonth();
  const pm = cm === 0 ? 11 : cm - 1;

  // =============================
  // CLIENT %
  // =============================
  const currentClients = monthlyClientsArr[cm] || 0;
  const prevClients = monthlyClientsArr[pm] || 0;

  let clientPercent = 0;

  if (prevClients === 0 && currentClients > 0) {
    clientPercent = 100;
  } else if (prevClients > 0) {
    clientPercent = ((currentClients - prevClients) / prevClients) * 100;
  }

  const c = Math.round(clientPercent);

  document.getElementById("insight1").innerText =
    c > 0
      ? `🔥 Client growth is up +${c}%`
      : c < 0
      ? `⚠️ Client growth is down ${c}%`
      : `➖ Client growth is flat (0%)`;

  // =============================
  // REVENUE %
  // =============================
  const revenueNow = monthlyRevenueArr[cm] || 0;
  const revenuePrev = monthlyRevenueArr[pm] || 0;

  let revenuePercent = 0;

  if (revenuePrev === 0 && revenueNow > 0) {
    revenuePercent = 100;
  } else if (revenuePrev > 0) {
    revenuePercent = ((revenueNow - revenuePrev) / revenuePrev) * 100;
  }

  const r = Math.round(revenuePercent);
  const diff = revenueNow - revenuePrev;

  document.getElementById("insight2").innerText =
    r > 0
      ? `📈 Revenue up +${r}% (${formatMoney(diff)})`
      : r < 0
      ? `📉 Revenue down ${r}% (${formatMoney(Math.abs(diff))})`
      : `➖ Revenue unchanged (0%)`;
}







function updateHeaderDescription(revenue, outstanding, clients, revenueArr, outstandingArr) {

  const r = document.getElementById("descRevenue");
  const o = document.getElementById("descOutstanding");
  const c = document.getElementById("descClients");
  const meta = document.getElementById("descMeta");

  if (r) r.innerText = formatMoney(revenue);
  if (o) o.innerText = formatMoney(outstanding);
  if (c) c.innerText = clients;

  // HEADER PILLS
  const hr = document.getElementById("headerRevenue");
  const ho = document.getElementById("headerOutstanding");

  if (hr) hr.innerText = formatMoney(revenue);
  if (ho) ho.innerText = formatMoney(outstanding);

  // TREND
  if (meta) {
    let percent = outstanding > 0
      ? ((revenue - outstanding) / outstanding) * 100
      : 0;

    percent = Math.round(percent);

    meta.classList.remove("positive","negative","neutral");

    if (percent > 0) {
      meta.classList.add("positive");
      meta.innerText = `📈 +${percent}% growth this period`;
    } else if (percent < 0) {
      meta.classList.add("negative");
      meta.innerText = `📉 ${percent}% decline`;
    } else {
      meta.classList.add("neutral");
      meta.innerText = `➖ Stable performance`;
    }
  }

drawHeaderSpark(revenueArr, outstandingArr);

}




function drawHeaderSpark(revenueData, outstandingData) {
  const canvas = document.getElementById("headerSpark");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (canvas.chart) canvas.chart.destroy();

  // 🌈 REVENUE GRADIENT (GREEN GLOW)
  const revenueGradient = ctx.createLinearGradient(0, 0, 0, 60);
  revenueGradient.addColorStop(0, "rgba(16,185,129,0.35)");
  revenueGradient.addColorStop(1, "rgba(16,185,129,0.02)");

  // 🌈 OUTSTANDING GRADIENT (RED FADE)
  const outstandingGradient = ctx.createLinearGradient(0, 0, 0, 60);
  outstandingGradient.addColorStop(0, "rgba(239,68,68,0.25)");
  outstandingGradient.addColorStop(1, "rgba(239,68,68,0.02)");

  canvas.chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: revenueData.map((_, i) => i),

      datasets: [

        // 🟢 REVENUE (PRIMARY)
        {
          label: "Revenue",
          data: revenueData,

          borderColor: "#10b981",
          backgroundColor: revenueGradient,

          borderWidth: 2.5,
          tension: 0.45,

          fill: true,
          pointRadius: 0,

          // ✨ smooth premium edges
          borderCapStyle: "round",
          borderJoinStyle: "round",
        },

        // 🔴 OUTSTANDING (SECONDARY)

{
  label: "Outstanding",
  data: outstandingData,
  borderColor: "#ef4444",
  backgroundColor: "rgba(239,68,68,0.15)",
  borderWidth: 3,          // 🔥 thicker
  tension: 0.4,
  fill: true,              // 🔥 makes it visible
  pointRadius: 0,
  borderDash: [6, 4]
}

      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      animation: {
        duration: 900,
        easing: "easeOutQuart"
      },

      plugins: {
        legend: { display: false },

        // 💎 TOOLTIP (optional but premium)
        tooltip: {
          enabled: true,
          backgroundColor: "#111827",
          titleColor: "#fff",
          bodyColor: "#e5e7eb",
          borderColor: "#374151",
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: function(ctx) {
              return `${ctx.dataset.label}: ${formatMoney(ctx.parsed.y)}`;
            }
          }
        }
      },

      scales: {
        x: { display: false },
        y: { display: false }
      },

      interaction: {
        mode: "index",
        intersect: false
      }
    }
  });
}




document.addEventListener("click", function(e){
  const row = e.target.closest(".invoice-row");
  if (!row) return;

  const ripple = document.createElement("span");
  ripple.className = "ripple";

  row.appendChild(ripple);

  setTimeout(() => ripple.remove(), 600);
});






function removeSkeletons(){
  document.querySelectorAll(".skeleton-text, .skeleton-box")
    .forEach(el => el.classList.remove("skeleton-text","skeleton-box"));

  document.querySelectorAll(".skeleton-card")
    .forEach(el => el.classList.remove("skeleton-card"));
}






function animateCount(el, end, duration = 1000, isMoney = false){

  if (!el) return;

  const start = 0;
  const startTime = performance.now();

  function update(currentTime){
    const progress = Math.min((currentTime - startTime) / duration, 1);

    const value = start + (end - start) * easeOutCubic(progress);

    if (isMoney){
      el.innerText = formatMoney(value);
    } else {
      el.innerText = Math.floor(value).toLocaleString();
    }

    if (progress < 1){
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

// smooth easing (premium feel)
function easeOutCubic(t){
  return 1 - Math.pow(1 - t, 3);
}



function updateKPITooltips(revenue, outstanding, totalClients, revenueArr, activeCount){

  const cm = new Date().getMonth();
  const pm = cm === 0 ? 11 : cm - 1;

  const current = revenueArr[cm] || 0;
  const previous = revenueArr[pm] || 0;

  let growth = 0;

  if (previous === 0 && current > 0){
    growth = 100;
  } else if (previous > 0){
    growth = ((current - previous) / previous) * 100;
  }

  const g = Math.round(growth);

  // 🎯 REVENUE
  const revenueCard = document.getElementById("totalRevenueCard");
  if (revenueCard){
    revenueCard.setAttribute(
      "data-tooltip",
      g > 0
        ? `Revenue is up ${g}% vs last month`
        : g < 0
        ? `Revenue dropped ${Math.abs(g)}% vs last month`
        : `Revenue unchanged this month`
    );
  }

  // 🎯 OUTSTANDING
  const outstandingCard = document.getElementById("outstandingCard");
  if (outstandingCard){
    outstandingCard.setAttribute(
      "data-tooltip",
      outstanding > revenue
        ? "⚠️ Outstanding is higher than revenue"
        : "Healthy balance between paid and unpaid invoices"
    );
  }

  // 🎯 TOTAL CLIENTS
  const clientsCard = document.getElementById("totalClientsCard");
  if (clientsCard){
    clientsCard.setAttribute(
      "data-tooltip",
      `${totalClients} total clients in your system`
    );
  }

  // 🎯 ACTIVE CLIENTS (THIS WAS YOUR GOAL)
  const activeCard = document.getElementById("activeClientsCard");
  if (activeCard){
    activeCard.setAttribute(
  "data-tooltip",
activeCount === 0
  ? "⚠️ No active clients"
  : activeCount < totalClients / 2
  ? `${activeCount} active — engagement is low`
  : `${activeCount} active — strong engagement`

);
  }
}

