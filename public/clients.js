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




function formatCurrency(amount){

return new Intl.NumberFormat("en-US",{
style:"currency",
currency:"USD"
}).format(Number(amount)||0);

}

/* ===============================
SAVE CLIENTS
=============================== */

function saveClients(){
localStorage.setItem("clients", JSON.stringify(allClients));
}


/* ===============================
ADD CLIENT
=============================== */

async function addClient(){

const name = document.getElementById("clientName").value.trim();
const email = document.getElementById("clientEmail").value.trim();
const phone = document.getElementById("clientPhone").value.trim();
const country = document.getElementById("clientCountry").value.trim();

if(!name){
alert("Client name required");
return;
}

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
country
})
});

if(!res.ok){
alert("Failed to create client");
return;
}

/* reload clients from database */

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

<td>${client.name}</td>
<td>${client.email ? client.email : "-"}</td>
<td>${client.phone ? client.phone : "-"}</td>
<td>${client.country ? client.country : "-"}</td>
<td>${formatCurrency(client.total_revenue || 0)}</td>

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
onclick="event.stopPropagation(); deleteClient('${client.id}')">
🗑
</button>

</td>

`;

row.addEventListener("click", () => openDrawer(client));

tbody.appendChild(row);

});

}


/* ===============================
DELETE CLIENT
=============================== */

function deleteClient(id){

const confirmed = confirm("Delete this client?");
if(!confirmed) return;

allClients = allClients.filter(c => c.id !== id);
filteredClients = filteredClients.filter(c => c.id !== id);

saveClients();
renderClients();
updateKPIs();

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
setText("clientRevenue", formatCurrency(revenue));

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


document.getElementById("drawerRevenue").textContent = formatCurrency(revenue);
document.getElementById("drawerInvoicesCount").textContent = clientInvoices.length;
document.getElementById("drawerPaid").textContent = formatCurrency(paid);
document.getElementById("drawerPending").textContent = formatCurrency(pending);


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
<td>${formatCurrency(inv.total)}</td>
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

amount = Number(amount) || 0;

return new Intl.NumberFormat("en-US",{
style:"currency",
currency:"USD"
}).format(amount);

}







