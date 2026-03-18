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
INIT
=============================== */

document.addEventListener("DOMContentLoaded", () => {

loadClients();
setupFilters();

});


/* ===============================
LOAD CLIENTS
=============================== */


async function loadClients(){

try{

const token = localStorage.getItem("token");

const res = await fetch("/clients",{
headers:{ Authorization:"Bearer "+token }
});

if(!res.ok){
throw new Error("Failed to load clients");
}

const clients = await res.json();

/* store globally */

allClients = clients;
filteredClients = [...clients];

/* render */

renderClients();
updateKPIs();
populateInvoiceClients();

}catch(err){

console.error("Client load error:",err);

}

}



// ===============================
// SAVE CLIENT
// ===============================

async function saveClient(){

  const token = localStorage.getItem("token");

  const payload = {
    name: document.getElementById("clientName").value,
    email: document.getElementById("clientEmail").value,
    phone: document.getElementById("clientPhone").value,
    country: document.getElementById("clientCountry").value
  };

  await fetch("/clients",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Authorization:"Bearer "+token
    },
    body:JSON.stringify(payload)
  });

  await loadClients(); // refresh list automatically
}







/* ===============================
ADD CLIENT
=============================== */

async function addClient(){

const name = document.getElementById("clientName").value.trim();
const email = document.getElementById("clientEmail").value.trim();
const phone = document.getElementById("clientPhone").value.trim();
const country = document.getElementById("clientCountry").value.trim();

const file = document.getElementById("clientAvatar").files[0];

if(!name){
alert("Client name required");
return;
}

let avatar = null;

/* convert image to base64 */

if(file){

const reader = new FileReader();

reader.onload = async function(e){

avatar = e.target.result;

await sendClient(name,email,phone,country,avatar);

};

reader.readAsDataURL(file);

}else{

await sendClient(name,email,phone,country,null);

}

}


async function sendClient(name,email,phone,country,avatar){

try{

const res = await fetch("/clients",{
method:"POST",
headers:{
"Content-Type":"application/json",
Authorization:"Bearer " + localStorage.getItem("token")
},
body: JSON.stringify({
name,
email,
phone,
country,
avatar
})
});

if(!res.ok){
alert("Failed to create client");
return;
}

await loadClients();

closeClientModal();
clearClientForm();

}catch(err){

console.error("Create client error:",err);

}

}

/* ===============================
RENDER CLIENT TABLE
=============================== */

function renderClients(){

const tbody = document.getElementById("clientsTableBody");
tbody.innerHTML = "";

filteredClients
.filter(client => client.name)
.forEach(client => {

const row = document.createElement("tr");

row.innerHTML = `

<td class="client-cell">

${client.avatar ? 
`<img src="${client.avatar}" class="client-avatar">` :
`<div class="client-avatar placeholder">${client.name.charAt(0).toUpperCase()}</div>`
}

<span>${client.name}</span>

</td>
<td>${client.email ? client.email : "-"}</td>
<td>${client.phone ? client.phone : "-"}</td>
<td>${client.country ? client.country : "-"}</td>
<td>${formatMoney(client.total_revenue || 0)}</td>
<td>
<span class="status-badge status-${client.status || "active"}">
${client.status || "active"}
</span>
</td>

<td>${client.invoice_count || 0}</td>

<td class="actions">

<button class="icon-btn" onclick="editClient('${client.id}')">
✏️
</button>

<button class="icon-btn delete-btn"
onclick="event.stopPropagation(); deleteClient(${client.id})">
🗑
</button>

`;

row.addEventListener("click", () => openDrawer(client));

tbody.appendChild(row);

});

}


/* ===============================
DELETE CLIENT
=============================== */

async function deleteClient(id){

const confirmed = confirm("Delete this client?");
if(!confirmed) return;

try{

const res = await fetch(`/clients/${id}`,{
method:"DELETE",
headers:{
Authorization: "Bearer " + localStorage.getItem("token")
}
});

if(!res.ok){
alert("Failed to delete client");
return;
}

await loadClients();

}catch(err){

console.error("Delete error:", err);
alert("Error deleting client");

}

}

/* ===============================
EDIT CLIENT
=============================== */

function editClient(id){

const client = allClients.find(c => c.id === id);
if(!client) return;

document.getElementById("clientName").value = client.name;
document.getElementById("clientEmail").value = client.email;
document.getElementById("clientPhone").value = client.phone;
document.getElementById("clientCountry").value = client.country;

openClientModal();

deleteClient(id);

}


/* ===============================
SEARCH
=============================== */

function searchClients(term){

term = term.toLowerCase();

filteredClients = allClients.filter(client =>

(client.name || "").toLowerCase().includes(term) ||
(client.email || "").toLowerCase().includes(term)

);

renderClients();

}


/* ===============================
FILTERS
=============================== */

function setupFilters(){

const statusFilter = document.getElementById("statusFilter");

statusFilter.addEventListener("change", () => {

const status = statusFilter.value;

if(!status){

filteredClients = [...allClients];

}else{

filteredClients = allClients.filter(c => c.status === status);

}

renderClients();

});

}


/* ===============================
KPIs
=============================== */

function updateKPIs(){

const total = allClients.length;

const active = allClients.filter(c => c.status === "active").length;

const inactive = allClients.filter(c => c.status === "inactive").length;

const revenue = allClients.reduce((sum,c)=>sum + Number(c.total_revenue || 0),0);

setText("totalClients", total);
setText("activeClients", active);
setText("inactiveClients", inactive);
setText("clientRevenue", formatMoney(revenue));
}


/* ===============================
DRAWER
=============================== */

async function openDrawer(client){

document.getElementById("clientDrawer").classList.add("open");

document.getElementById("drawerClientName").textContent = client.name;
document.getElementById("drawerEmail").textContent = client.email || "-";
document.getElementById("drawerPhone").textContent = client.phone || "-";
document.getElementById("drawerCountry").textContent = client.country || "-";


try{

const token = localStorage.getItem("token");

const res = await fetch("/invoices",{
headers:{ Authorization:"Bearer " + token }
});

const invoices = await res.json();


const clientInvoices = invoices.filter(inv =>
(inv.client_name || inv.client || "").toLowerCase() === client.name.toLowerCase()


);


let paid = 0;
let pending = 0;
let revenue = 0;

clientInvoices.forEach(inv=>{

const amount = Number(inv.total || 0);

revenue += amount;

if((inv.status || "").toLowerCase() === "paid") paid += amount;

if((inv.status || "").toLowerCase() === "pending") pending += amount;


});

/* REVENUE CHART */

const ctx = document.getElementById("drawerRevenueChart");

if (ctx && typeof Chart !== "undefined") {

if (window.drawerChart) {
window.drawerChart.destroy();
}

window.drawerChart = new Chart(ctx, {
type: "doughnut",
data: {
labels: ["Paid", "Pending"],
datasets: [{
data: [paid, pending],
backgroundColor: ["#22c55e", "#f59e0b"]
}]
},
options: {
plugins: {
legend: { position: "bottom" }
}
}
});

}

/* CLIENT TIMELINE */

const timeline = document.getElementById("drawerTimeline");

if (timeline) {

timeline.innerHTML = "";

clientInvoices
.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))
.forEach(inv=>{

const amount = Number(inv.total || 0);

const item = document.createElement("div");

item.className = "timeline-item";

item.innerHTML = `
<div class="timeline-date">
${new Date(inv.created_at).toLocaleDateString()}
</div>
<div class="timeline-text">
Invoice #${inv.id} • ${formatMoney(amount)} • ${inv.status}
</div>
`;

timeline.appendChild(item);

});

}


document.getElementById("drawerRevenue").textContent = formatMoney(revenue);
document.getElementById("drawerInvoicesCount").textContent = clientInvoices.length;
document.getElementById("drawerPaid").textContent = formatMoney(paid);
document.getElementById("drawerPending").textContent = formatMoney(pending);

const table = document.getElementById("drawerInvoicesTable");

table.innerHTML = "";


if(clientInvoices.length === 0){
table.innerHTML = `<tr><td colspan="4">No invoices</td></tr>`;
return;
}


clientInvoices.forEach(inv=>{

const row = document.createElement("tr");

row.innerHTML = `
<td>#${inv.id}</td>
<td>${new Date(inv.created_at).toLocaleDateString()}</td>
<td>${formatMoney(inv.total)}</td>

<td class="status-${inv.status}">${inv.status}</td>
`;

table.appendChild(row);

});

}catch(err){

console.error("Drawer invoice error:",err);

}

}

function closeDrawer(){
document.getElementById("clientDrawer").classList.remove("open");
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

function clearClientForm(){

document.getElementById("clientName").value="";
document.getElementById("clientEmail").value="";
document.getElementById("clientPhone").value="";
document.getElementById("clientCountry").value="";

}

function setText(id,value){
const el = document.getElementById(id);
if(el) el.textContent = value;
}

function formatCurrency(amount){
return formatMoney(amount);
}






