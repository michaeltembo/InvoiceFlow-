// ===============================
// GLOBAL STATE
// ===============================

let clients = [];
let allClients = [];
let filteredClients = [];

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

    clients = await res.json();   // IMPORTANT: remove "const"

    // save clients to storage
    localStorage.setItem("clients", JSON.stringify(clients));

    // update global state
    allClients = clients;
    filteredClients = [...clients];

    renderClients();
    updateKPIs();

  } catch (err) {
    console.error("Load clients error:", err);
  }
}


// ===============================
// LOAD INVOICES
// ===============================

async function loadInvoices() {

const res = await fetch("/invoices", {
headers: getAuthHeaders()
});

invoices = await res.json();

localStorage.setItem("invoices", JSON.stringify(invoices)); // MUST BE HERE

invoices = updateInvoiceStatuses(invoices);

renderInvoices(invoices);
updateKPIs(invoices);

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

  document.getElementById("totalInvoices").textContent = totalInvoices;
  document.getElementById("paidInvoices").textContent = paid.length;
  document.getElementById("pendingInvoices").textContent = pending.length;

  document.getElementById("totalRevenue").textContent =
    formatMoney(totalRevenue);

  document.getElementById("outstandingRevenue").textContent =
    formatMoney(outstanding);

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
    <td class="lineTotal">$0.00</td>
    <td><button onclick="this.closest('tr').remove(); calculateTotals()">X</button></td>
  `;

  tbody.appendChild(row);

  row.querySelectorAll("input").forEach(input =>
    input.addEventListener("input", calculateTotals)
  );
}

function calculateTotals() {
  let subtotal = 0;

  document.querySelectorAll("#lineItems tr").forEach(row => {
    const qty = Number(row.querySelector(".qty").value);
    const price = Number(row.querySelector(".price").value);
    const total = qty * price;

    row.querySelector(".lineTotal").textContent = `$${total.toFixed(2)}`;
    subtotal += total;
  });

  const taxRate = Number(document.getElementById("taxRate").value);
  const taxAmount = subtotal * (taxRate / 100);
  const grandTotal = subtotal + taxAmount;

  document.getElementById("subtotal").textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById("taxAmount").textContent = `$${taxAmount.toFixed(2)}`;
  document.getElementById("grandTotal").textContent = `$${grandTotal.toFixed(2)}`;
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
   await fetch("/invoices", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });

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

const confirmed = confirm("Delete this invoice?");
if(!confirmed) return;

try{

const token = localStorage.getItem("token");

const res = await fetch(`/invoices/${id}`,{
method:"DELETE",
headers:{
"Authorization":"Bearer "+token
}
});

if(!res.ok){
alert("Failed to delete invoice");
return;
}

/* find invoice first */

const invoice = invoices.find(i => String(i.id) === String(id));

/* move to trash */

if(invoice){
moveToTrash({
type:"invoice",
data:invoice
});
}

/* reload invoices */

await loadInvoices();

}catch(err){

console.error("Delete invoice error:",err);

}

}

function openInvoiceModal() {

populateInvoiceClients();   // MUST RUN

document.getElementById("invoiceModal").style.display = "flex";

}

function closeInvoiceModal() {
  const modal = document.getElementById("invoiceModal");
  if (!modal) return;

  modal.style.display = "none";
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


function formatMoney(amount){
  return new Intl.NumberFormat("en-US",{
    style:"currency",
    currency:"USD"
  }).format(Number(amount) || 0);
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
