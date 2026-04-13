
function safeSet(id, value){
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}


const currency = localStorage.getItem("currency") || "ZMW";

const rates = {
  USD:1,
  EUR:0.92,
  GBP:0.79,
  ZMW:27
};

function convert(amount){
  const rate = rates[currency] || 1;
  return amount * rate;
}

function formatMoney(amount){
  const converted = convert(amount);

  return new Intl.NumberFormat("en-US",{
    style:"currency",
    currency: currency
  }).format(converted);
}




// ===============================
// GLOBAL STATE
// ===============================

let clients = [];
let allClients = [];
let filteredClients = [];
let invoices = [];
// ===============================
// AUTH HEADER
// ===============================

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    return {};
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

// ===============================
// INIT
// ===============================

document.addEventListener("DOMContentLoaded", async () => {

  setupSidebar();

  await loadClients();
  await loadInvoices();

  setupFilters();

  const params = new URLSearchParams(window.location.search);
  const clientId = params.get("client_id");

  if(clientId){

    const interval = setInterval(()=>{

      const select = document.getElementById("invoiceClient");

      if(select && select.querySelector(`option[value="${clientId}"]`)){

        select.value = clientId;

        clearInterval(interval);

      }

    },100);

  }

});


// ===============================
// VIEW INVOICE (REDIRECT)
// ===============================
window.viewInvoice = function(id) {
  window.location.href = "invoice-view.html?id=" + id;
};


// ===============================
// LOAD CLIENTS
// ===============================

async function loadClients() {
  try {


    const res = await fetch("/clients", {
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      throw new Error("Failed to fetch clients");
    }

    const raw = await res.json();

    // ✅ NORMALIZE (IMPORTANT)
    let data =
      raw.data ||
      raw.clients ||
      raw.results ||
      raw ||
      [];

    if (!Array.isArray(data)) {
      data = [];
    }

    clients = data;

    populateInvoiceClients();

    localStorage.setItem("clients", JSON.stringify(clients));

    allClients = clients;
    filteredClients = [...clients];

    renderClients();

    // ❌ REMOVE THIS (WRONG PLACE)
    // updateKPIs();



  } catch (err) {
    console.error("Load clients error:", err);
  }
}



function openInvoiceFromURL(){

const params = new URLSearchParams(window.location.search);
const clientId = params.get("client_id");

if(!clientId) return;

/* open modal first */

openInvoiceModal();

/* wait for clients dropdown to populate */

setTimeout(()=>{

const select = document.getElementById("invoiceClient");

if(select){
select.value = clientId;
}

},200);

}

// ===============================
// LOAD INVOICES
// ===============================

async function loadInvoices(){
  try{

    // =========================
    // STAGE 1: Instant UI
    // =========================
    startHeaderSkeleton?.();
    startInvoiceSkeleton?.();
    showInvoiceTableSkeleton?.();
    startUsageSkeleton?.();

    // 🔥 Show cached data instantly (SUPER PREMIUM FEEL)
    const cached = JSON.parse(localStorage.getItem("invoices") || "[]");

    if (cached.length){
      renderInvoices?.(cached);
      updateKPIs?.(cached);
    }

    // =========================
    // STAGE 2: Fetch fresh data
    // =========================
    const res = await fetch("/invoices",{
      headers: getAuthHeaders()
    });

    if(!res.ok){
      throw new Error("Failed to load invoices");
    }

    const raw = await res.json();

    // =========================
    // STAGE 3: Normalize FAST
    // =========================
    let data = [];

    if (Array.isArray(raw)) data = raw;
    else if (Array.isArray(raw.data)) data = raw.data;
    else if (Array.isArray(raw.invoices)) data = raw.invoices;
    else if (Array.isArray(raw.results)) data = raw.results;
    else if (Array.isArray(raw?.data?.invoices)) data = raw.data.invoices;

    if (!Array.isArray(data)) data = [];

    invoices = updateInvoiceStatuses(data);

    // =========================
    // STAGE 4: Save cache EARLY
    // =========================
    localStorage.setItem("invoices", JSON.stringify(invoices));

    // =========================
    // STAGE 5: Render KPIs FIRST
    // =========================
    updateKPIs?.(invoices);

const metrics = calculateAdvancedMetrics(invoices);

renderAdvancedMetrics(metrics);

// sparklines

renderSparkline("mrrSpark", metrics.monthlyRevenue);
renderSparkline("collectionSpark", metrics.monthlyRevenue);
renderSparkline("overdueSpark", metrics.monthlyRevenue.map(v => v * 0.4));
renderSparkline("avgSpark", metrics.monthlyRevenue.map(v => v / 1000));
    // 🔥 stop header skeleton early (feels fast)
    stopHeaderSkeleton?.();


// =========================
// STAGE 6: Progressive table render
// =========================

const tbody = document.getElementById("invoiceTableBody");

if (tbody) {
  tbody.innerHTML = ""; // clear skeleton

  invoices.forEach((inv, i) => {

    const row = createInvoiceRow(inv); // 🔥 IMPORTANT: reuse your row logic

    row.style.opacity = 0;
    row.style.transform = "translateY(6px)";

    tbody.appendChild(row);

    // 🔥 STAGGERED animation (elite feel)
    setTimeout(() => {
      row.style.transition = "all 0.3s ease";
      row.style.opacity = 1;
      row.style.transform = "translateY(0)";
    }, i * 40); // delay per row
  });
}

stopInvoiceSkeleton?.();


    // =========================
    // STAGE 7: Background tasks
    // =========================
    requestAnimationFrame(() => {
      checkLimit?.();
      updateUsage?.();
    });

  }catch(err){

    console.error("❌ Invoice load error:", err);

  }finally{

    // ✅ Ensure everything stops
    stopInvoiceSkeleton?.();
    stopHeaderSkeleton?.();
    stopUsageSkeleton?.();
  }
}


// ===============================
// STATUS LOGIC
// ===============================

function computeStatus(inv) {
  const today = new Date();
  const due = inv.due_date ? new Date(inv.due_date) : null;

  if (inv.status === "paid") return "paid";

  if (due && due < today) return "overdue";

  return "pending";
}


// ===============================
// KPI CALCULATIONS
// ===============================


function updateKPIs(data){

  if (!Array.isArray(data)) data = [];

  const totalInvoices = data.length;

  const paid = data.filter(i => computeStatus(i) === "paid");
  const pending = data.filter(i => computeStatus(i) === "pending");
  const overdue = data.filter(i => computeStatus(i) === "overdue");

  const totalRevenue = paid.reduce(
    (sum,i)=> sum + (Number(i.total) || 0),
    0
  );

  const outstanding = [...pending,...overdue].reduce(
    (sum,i)=> sum + (Number(i.total) || 0),
    0
  );


  // =========================
  // MAIN VALUES
  // =========================
  safeSet("totalInvoices", totalInvoices);
  safeSet("paidInvoices", paid.length);
  safeSet("pendingInvoices", pending.length);
  safeSet("totalRevenue", formatMoney(totalRevenue));
  safeSet("outstandingRevenue", formatMoney(outstanding));

  // =========================
  // TREND CALCULATION
  // =========================
  const now = new Date();

  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
  const lastMonth = lastMonthDate.getMonth();
  const lastYear = lastMonthDate.getFullYear();

  let currentTotal = 0, lastTotal = 0;
  let currentPaid = 0, lastPaid = 0;
  let currentPending = 0, lastPending = 0;
  let currentRevenue = 0, lastRevenue = 0;
  let currentOutstanding = 0, lastOutstanding = 0;

  data.forEach(inv => {

    const status = computeStatus(inv);
    const rawDate = inv.created_at || inv.createdAt || inv.date;
    const date = rawDate ? new Date(rawDate) : null;

    if (!date || isNaN(date)) return;

    const amount = Number(inv.total) || 0;

    // CURRENT MONTH
    if (date.getMonth() === currentMonth && date.getFullYear() === currentYear){
      currentTotal++;

      if (status === "paid"){
        currentPaid++;
        currentRevenue += amount;
      }

      if (status === "pending" || status === "overdue"){
        currentPending++;
        currentOutstanding += amount;
      }
    }

    // LAST MONTH
    if (date.getMonth() === lastMonth && date.getFullYear() === lastYear){
      lastTotal++;

      if (status === "paid"){
        lastPaid++;
        lastRevenue += amount;
      }

      if (status === "pending" || status === "overdue"){
        lastPending++;
        lastOutstanding += amount;
      }
    }

  });





  // =========================
  // FINAL METRICS
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

  safeTrend("totalInvoicesTrend", calc(currentTotal, lastTotal));
  safeTrend("paidTrend", calc(currentPaid, lastPaid));
  safeTrend("pendingTrend", calc(currentPending, lastPending));
  safeTrend("revenueTrend", calc(currentRevenue, lastRevenue));
  safeTrend("outstandingTrend", calc(currentOutstanding, lastOutstanding));

  // =========================
  // OPTIONAL UI (SAFE)
  // =========================
  if (typeof triggerRevenuePulse === "function"){
    triggerRevenuePulse();
  }

  if (typeof renderSparkline === "function"){
    renderSparkline("clientsSpark", [5,8,6,10,14,18,22]);
    renderSparkline("activeSpark", [3,6,5,9,12,15,18]);
    renderSparkline("revenueSpark", [200,400,350,800,1200,2000]);
    renderSparkline("outstandingSpark", [100,200,150,300,250]);
    renderSparkline("pendingSpark", [2,4,3,5,6,7]);
  }

}

// ===============================
// SEARCH + FILTER
// ===============================

function setupFilters() {
  const search = document.getElementById("invoiceSearch");
  const statusFilter = document.getElementById("statusFilter");

  search.addEventListener("input", applyFilters);
  statusFilter.addEventListener("change", applyFilters);
}

function applyFilters() {
  const searchVal = document.getElementById("invoiceSearch").value.toLowerCase();
  const statusVal = document.getElementById("statusFilter").value;

  let filtered = invoices.filter(inv => {
    const matchSearch =
      inv.client_name?.toLowerCase().includes(searchVal) ||
      String(inv.id).includes(searchVal);

    const matchStatus =
      !statusVal || computeStatus(inv) === statusVal;

    return matchSearch && matchStatus;
  });

  renderInvoices(filtered);
  updateKPIs(filtered);
}


// ===============================
// LINE ITEMS
// ===============================

function addLineItem() {
  const tbody = document.getElementById("lineItems");

  const row = document.createElement("tr");

  row.innerHTML = `
    <td><input type="text" class="desc"></td>
    <td><input type="number" class="qty" value="1"></td>
    <td><input type="number" class="price" value="0"></td>
   <td class="lineTotal">${money(0)}</td>
    <td><button onclick="this.closest('tr').remove(); calculateTotals()">X</button></td>
  `;

  tbody.appendChild(row);

  row.querySelectorAll("input").forEach(input =>
    input.addEventListener("input", calculateTotals)
  );
}

function calculateTotals(){

let subtotal = 0;

/* Calculate line totals */

document.querySelectorAll("#lineItems tr").forEach(row => {

const qty = Number(row.querySelector(".qty").value) || 0;
const price = Number(row.querySelector(".price").value) || 0;

const lineTotal = qty * price;

subtotal += lineTotal;

/* update line total */

row.querySelector(".lineTotal").textContent = formatMoney(lineTotal);

});

/* tax calculation */

const taxRate = Number(document.getElementById("taxRate").value) || 0;

const taxAmount = subtotal * (taxRate / 100);

/* final total */

const grandTotal = subtotal + taxAmount;

/* update UI */

document.getElementById("subtotal").textContent =
formatMoney(subtotal);

document.getElementById("taxAmount").textContent =
formatMoney(taxAmount);

document.getElementById("grandTotal").textContent =
formatMoney(grandTotal);

}

// ===============================
// SAVE INVOICE
// ===============================


async function saveInvoice() {

  const items = [];

  document.querySelectorAll("#lineItems tr").forEach(row => {
    items.push({
      description: row.querySelector(".desc").value,
      quantity: Number(row.querySelector(".qty").value),
      price: Number(row.querySelector(".price").value)
    });
  });

  const payload = {
    client_id: Number(document.getElementById("invoiceClient").value),
    created_at: document.getElementById("invoiceDate").value,
    due_date: document.getElementById("dueDate").value,
    status: document.getElementById("invoiceStatus").value,
    tax_rate: Number(document.getElementById("taxRate").value),
    items
  };

  try {

    const res = await fetch("/invoices", {
      method: "POST",
      headers: getJSONHeaders(),
      body: JSON.stringify(payload)
    });

if(!res.ok){
  const data = await res.json();

  if(data.error === "limit_reached"){
    alert("🚀 You’ve reached your free limit (5 invoices). Upgrade to Pro.");
  } else {
    alert(data.error || "Failed to save invoice");
  }

  return;
}

    /* clear form */

    document.getElementById("lineItems").innerHTML = "";

    closeInvoiceModal();

    await loadInvoices();

  } catch (err) {
    console.error("Save invoice error:", err);
  }
}
// ===============================
// MARK AS PAID
// ===============================

async function markAsPaid(id) {
  try {
    const res = await fetch(`/invoices/${id}/pay`, {
      method: "PUT",
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      alert("Failed to mark as paid");
      return;
    }

    await loadInvoices();

  } catch (err) {
    console.error("Mark paid error:", err);
  }
}

// ===============================
// UTIL
// ===============================

function formatDate(date){
  return new Date(date).toLocaleDateString("en-US",{
    month:"short",
    day:"numeric",
    year:"numeric"
  });
}

async function viewInvoice(id) {
  try {
    const res = await fetch(`/invoices/${id}`, {
      headers: getAuthHeaders()
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Failed to load invoice");
      return;
    }

    const invoice = data.invoice;
    const items = data.items;

    let itemsHTML = items.map(item => `
      <tr>
        <td>${item.description}</td>
        <td>${item.quantity}</td>

<td>${formatMoney(Number(item.price) || 0)}</td>
<td>${formatMoney((Number(item.quantity) || 0) * (Number(item.price) || 0))}</td>


      </tr>
    `).join("");

    document.getElementById("viewInvoiceContent").innerHTML = `
      <p><strong>Client:</strong> ${invoice.client_name || "-"}</p>
      <p><strong>Date:</strong> ${formatDate(invoice.created_at)}</p>
      <p><strong>Due:</strong> ${formatDate(invoice.due_date)}</p>
      <p><strong>Status:</strong> ${invoice.status}</p>

      <table class="premium-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>

      <div style="text-align:right; margin-top:20px;">

<p>Subtotal: ${formatMoney(invoice.subtotal)}</p>
<p>Tax: ${formatMoney(invoice.tax_amount)}</p>
<h3>Total: ${formatMoney(invoice.total)}</h3>

      </div>
    `;

    document.getElementById("viewInvoiceModal").style.display = "flex";

  } catch (err) {
    console.error("View invoice error:", err);
  }
}

function closeViewModal() {
  document.getElementById("viewInvoiceModal").style.display = "none";
}


function moveToTrash(item){

if(!item) return

let trash = JSON.parse(localStorage.getItem("trash")) || []

trash.push(item)

localStorage.setItem("trash", JSON.stringify(trash))

console.log("Trash updated:", trash)

}
async function deleteInvoice(id){

  const confirmed = confirm("Delete this invoice permanently?");
  if(!confirmed) return;

  try{

    const token = localStorage.getItem("token");

    const res = await fetch(`/invoices/${id}`,{
      method:"DELETE",
      headers:{
        "Authorization":"Bearer " + token
      }
    });

    const data = await res.json();

    if(!res.ok){
      alert(data.error || "Failed to delete invoice");
      return;
    }

    alert("Invoice permanently deleted");

    await loadInvoices(); // refresh UI

  } catch(err){

    console.error("Delete invoice error:", err);
    alert("Error deleting invoice");

  }

}


function openInvoiceModal() {
  document.getElementById("invoiceModal").style.display = "flex";
}


function closeInvoiceModal() {
  document.body.style.overflow = "auto";
  document.getElementById("invoiceModal").style.display = "none";
}

function renderInvoices(data) {
  const tbody = document.getElementById("invoiceTableBody");

  if (!data.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center;">
          No invoices found
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = data.map(inv => {
    const status = computeStatus(inv);

    return `
      <tr>
       <td class="invoice-id">#${inv.id}</td>
        <td>${inv.client_name || "-"}</td>
        <td>${formatDate(inv.created_at)}</td>
        <td>${formatDate(inv.due_date)}</td>
        <td>${formatMoney(inv.total)}</td>
        <td>
          <span class="status ${status}">${status}</span>
        </td>

<td class="actions">

${status !== "paid"
? `<button class="action-btn pay-btn" onclick="markAsPaid(${inv.id})">
Mark Paid
</button>`
: `<button class="action-btn paid-btn">Paid</button>`
}

<button class="action-btn view-btn" onclick="viewInvoice(${inv.id})">
View
</button>

<button class="action-btn delete-btn" onclick="deleteInvoice(${inv.id})">
Delete
</button>

</td>

      </tr>
    `;
  }).join("");
}




function updateInvoiceStatuses(invoices){

  const today = new Date();

  invoices.forEach(inv => {

    if(inv.status !== "paid"){

      const due = new Date(inv.due_date);

      if(today > due){
        inv.status = "overdue";
      }

    }

  });

  return invoices;
}


function toggleSearch(){

const search = document.querySelector(".search");

search.classList.toggle("active");

if(search.classList.contains("active")){
search.focus();
}

}


function populateInvoiceClients() {

const select = document.getElementById("invoiceClient");
if(!select) return;

select.innerHTML = '<option value="">Select Client</option>';

clients.forEach(client => {

const option = document.createElement("option");

option.value = client.id;     // MUST be database ID (integer)
option.textContent = client.name;

select.appendChild(option);

});

}






function calc(current, last){
  if (last === 0 && current === 0) return 0;

  // 🔥 KEY FIX
  if (last === 0 && current > 0) return 100;

  return ((current - last) / last) * 100;
}
















function animateValue(id, end, duration = 1500) {
  const el = document.getElementById(id);
  if (!el) return;

  const start = 0;
  const startTime = performance.now();

  function update(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const value = Math.floor(progress * (end - start) + start);

    el.textContent = typeof end === "number"
      ? value
      : end;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}


function triggerRevenuePulse(){
  const card = document.getElementById("totalRevenueCard");
  if (!card) return;

  card.classList.remove("pulse");
  void card.offsetWidth; // reset animation
  card.classList.add("pulse");
}



function renderSparkline(canvasId, dataArr){

  const ctx = document.getElementById(canvasId);

  new Chart(ctx, {
    type: "line",
    data: {
      labels: dataArr.map((_,i)=>i+1),
      datasets: [{
        data: dataArr,
        borderWidth: 2,
        fill: false,
        tension: 0.4
      }]
    },
    options: {
      plugins: { legend: { display: false }},
      scales: { x: { display:false }, y:{ display:false }},
    }
  });
}

function showSkeleton(){
  ["totalClients","activeClients","inactiveClients","clientRevenue"]
  .forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;

    el.classList.add("skeleton");
    el.textContent = " ";
  });
}

function hideSkeleton(){
  document.querySelectorAll(".skeleton")
    .forEach(el=>el.classList.remove("skeleton"));
}









async function checkLimit(){

  const res = await fetch("/subscription",{
    headers:{
      "Authorization":"Bearer " + localStorage.getItem("token")
    }
  });

  const sub = await res.json();

  if(sub.plan !== "pro" && invoices.length >= 5){
    const btn = document.querySelector(".create-btn");

    if(btn){
      btn.disabled = true;
      btn.innerText = "Upgrade to Pro";
    }
  }

}





async function upgradePlan(){

  const btn = document.getElementById("upgradeBtn");
  if(btn){
    btn.disabled = true;
    btn.innerText = "Redirecting...";
  }

  try{
    const res = await fetch("/create-checkout-session",{
      method:"POST",
      headers:{
        "Authorization":"Bearer " + localStorage.getItem("token")
      }
    });

    const data = await res.json();

    if(!res.ok || !data.url){
      throw new Error(data.error || "Checkout failed");
    }

    window.location.href = data.url;

  }catch(err){
    alert(err.message);

    // restore button
    if(btn){
      btn.disabled = false;
      btn.innerText = "Upgrade";
    }
  }
}





async function updateUsage(){

  const res = await fetch("/subscription",{
    headers:{
      "Authorization":"Bearer " + localStorage.getItem("token")
    }
  });

  const sub = await res.json();
  const plan = sub.plan || sub.subscription_status || "free";

  const used = invoices.length;
  const limit = plan === "pro" ? Infinity : 5;

  const text = document.getElementById("usageInfo");
  const fill = document.getElementById("usageFill");
  const btn = document.getElementById("upgradeBtn");

  if(!text || !fill) return;

  // TEXT
  text.innerText =
    `${used} / ${plan === "pro" ? "∞" : limit}`;

if(used === 4 && plan !== "pro"){
  document.getElementById("usageInfo").innerText += " ⚠️ Almost at limit";
}

  // PRO USER
  if(plan === "pro"){
    fill.style.width = "100%";
    fill.classList.remove("warning","danger");

    if(btn) btn.style.display = "none"; // hide upgrade
    return;
  }

  // SHOW BUTTON
  if(btn) btn.style.display = "inline-block";

  // PROGRESS %
  const percent = Math.min((used / limit) * 100, 100);
  fill.style.width = percent + "%";

  // COLOR STATES
  fill.classList.remove("warning","danger");

  if(percent >= 90){
    fill.classList.add("danger");
  } else if(percent >= 70){
    fill.classList.add("warning");
  }
}




document.addEventListener("click", function(e){

  if(e.target && e.target.id === "upgradeBtn"){
    console.log("🔥 Upgrade clicked");
    upgradePlan();
  }

});






function startInvoiceSkeleton(){
  document.querySelectorAll(".stat-card").forEach(card=>{
    card.classList.add("skeleton-card");
  });

  document.querySelectorAll(".stat-number, .stat-label, .stat-trend").forEach(el=>{
    el.classList.add("skeleton-text");
  });

  document.querySelectorAll(".stat-icon").forEach(icon=>{
    icon.classList.add("skeleton-box");
  });
}




function stopInvoiceSkeleton(){
  document.querySelectorAll(".stat-card").forEach(card=>{
    card.classList.remove("skeleton-card");
  });

  document.querySelectorAll(".stat-number, .stat-label, .stat-trend").forEach(el=>{
    el.classList.remove("skeleton-text");
  });

  document.querySelectorAll(".stat-icon").forEach(icon=>{
    icon.classList.remove("skeleton-box");
  });
}








function showInvoiceTableSkeleton(){
  const tbody = document.getElementById("invoiceTableBody");
  if(!tbody) return;

  tbody.innerHTML = "";

  for(let i = 0; i < 6; i++){
    const row = document.createElement("tr");
    row.className = "skeleton-row";

    row.innerHTML = `
      <td><div class="skeleton-box sm"></div></td>
      <td><div class="skeleton-box"></div></td>
      <td><div class="skeleton-box sm"></div></td>
      <td><div class="skeleton-box sm"></div></td>
      <td><div class="skeleton-box"></div></td>
      <td><div class="skeleton-badge"></div></td>
      <td>
        <div style="display:flex; gap:6px;">
          <div class="skeleton-box icon"></div>
          <div class="skeleton-box icon"></div>
        </div>
      </td>
    `;

    tbody.appendChild(row);
  }
}





function startHeaderSkeleton(){
  document.querySelector(".page-header")?.classList.add("loading");

  document.querySelectorAll(".page-header .skeleton-text")
    .forEach(el => el.classList.add("active"));

  document.querySelector(".skeleton-button")
    ?.classList.add("active");
}

function stopHeaderSkeleton(){
  document.querySelector(".page-header")?.classList.remove("loading");

  document.querySelectorAll(".page-header .skeleton-text")
    .forEach(el => el.classList.remove("skeleton-text"));

  document.querySelector(".skeleton-button")
    ?.classList.remove("skeleton-button");
}







function startUsageSkeleton(){
  const card = document.querySelector(".usage-card");
  if(!card) return;

  card.querySelectorAll("*").forEach(el=>{
    if(el.classList.contains("usage-label") ||
       el.classList.contains("usage-text")){
      el.classList.add("skeleton-text");
    }

    if(el.classList.contains("upgrade-mini")){
      el.classList.add("skeleton-button");
    }

    if(el.id === "usageFill"){
      el.classList.add("skeleton-fill");
    }
  });
}




function stopUsageSkeleton(){
  const card = document.querySelector(".usage-card");
  if(!card) return;

  card.querySelectorAll("*").forEach(el=>{
    el.classList.remove("skeleton-text");
    el.classList.remove("skeleton-button");
    el.classList.remove("skeleton-fill");
  });
}




function formatTrend(value){
  const v = Math.round(value);

  if (v > 0) return `+${v}% ↑`;
  if (v < 0) return `${v}% ↓`;
  return `0% →`;
}


function setTrend(el, value){
  if (!el) return;

  const v = Math.round(value);

  if (v > 0){
    el.className = "stat-trend up";
    el.innerText = `+${v}% ↑`;
  } 
  else if (v < 0){
    el.className = "stat-trend down";
    el.innerText = `${v}% ↓`;
  } 
  else {
    el.className = "stat-trend neutral";
    el.innerText = `0% →`;
  }
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




function applyFadeIn(selector){
  const elements = document.querySelectorAll(selector);

  elements.forEach((el, i) => {
    el.style.animationDelay = `${i * 0.05}s`; // stagger effect
    el.classList.add("fade-in");
  });
}




function createInvoiceRow(inv){
  const row = document.createElement("tr");

  row.innerHTML = `
    <td>#${inv.id || "-"}</td>
    <td>${inv.client_name || "-"}</td>
    <td>${formatMoney(inv.total || 0)}</td>
    <td>${formatDate(inv.created_at)}</td>
    <td>${(inv.status || "").toUpperCase()}</td>
  `;

  return row;
}






function renderAdvancedMetrics(data){

  safeSet("mrrValue", formatMoney(data.mrr));
  setTrend(document.getElementById("mrrTrend"), data.mrrTrend);

  safeSet("collectionRate", data.collectionRate.toFixed(1) + "%");
setTrend(document.getElementById("collectionTrend"), data.collectionTrend);

  safeSet("overdueAmount", formatMoney(data.overdueAmount));
setTrend(document.getElementById("overdueTrend"), data.overdueTrend);



  safeSet("avgPaymentTime", Math.round(data.avgPaymentTime) + " days");
setTrend(document.getElementById("avgTimeTrend"), data.avgTrend);

}

function calculateAdvancedMetrics(invoices = []) {

  let totalRevenue = 0;
  let paidRevenue = 0;
  let overdueAmount = 0;
  let paymentDays = [];

  const monthlyRevenue = Array(12).fill(0);

  invoices.forEach(inv => {

    const total = Number(inv.total || 0);
    totalRevenue += total;

    const status = computeStatus(inv);

    // ✅ PAID
    if (status === "paid") {
      paidRevenue += total;

      const issueRaw = inv.created_at || inv.createdAt || inv.date;
      const dueRaw = inv.due_date;

      if (issueRaw && dueRaw) {
        const issue = new Date(issueRaw);
        const due = new Date(dueRaw);

        const diff = (due - issue) / (1000 * 60 * 60 * 24);
        if (!isNaN(diff)) paymentDays.push(diff);
      }
    }

    // ✅ OVERDUE
    if (status === "overdue") {
      overdueAmount += total;
    }

    // ✅ MONTHLY REVENUE (FIXED)

const rawDate = inv.created_at || inv.createdAt || inv.date;

if (!rawDate) return;

const d = new Date(rawDate);

if (isNaN(d.getTime())) return;

// 🔥 FORCE LOCAL MONTH (fix timezone bugs)
const month = d.getUTCMonth();

monthlyRevenue[month] += total;

  });

  const collectionRate = totalRevenue
    ? (paidRevenue / totalRevenue) * 100
    : 0;

  const avgPaymentTime = paymentDays.length
    ? paymentDays.reduce((a,b)=>a+b,0) / paymentDays.length
    : 0;

const currentMonth = new Date().getUTCMonth();
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;


  const mrr = monthlyRevenue[currentMonth] || 0;
  const prevMrr = monthlyRevenue[prevMonth] || 0;

  const mrrTrend = prevMrr
    ? ((mrr - prevMrr) / prevMrr) * 100
    : (mrr > 0 ? 100 : 0);

const prevRevenue = monthlyRevenue[prevMonth] || 0;

const prevCollectionRate = prevRevenue
  ? (prevRevenue / (prevRevenue || 1)) * 100
  : 0;

const collectionTrend = prevCollectionRate
  ? ((collectionRate - prevCollectionRate) / prevCollectionRate) * 100
  : (collectionRate > 0 ? 100 : 0);

const overdueTrend = overdueAmount > 0 ? 100 : 0;

const avgTrend = avgPaymentTime > 0 ? 100 : 0;

  return {
  mrr,
  mrrTrend,
  collectionRate,
  collectionTrend,
  overdueAmount,
  overdueTrend,
  avgPaymentTime,
  avgTrend,
  monthlyRevenue
};


}
