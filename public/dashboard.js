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

// =============================
// LOAD DASHBOARD
// =============================

document.addEventListener("DOMContentLoaded", loadDashboard);

async function loadDashboard(){

try{

const token = localStorage.getItem("token");

const res = await fetch("/invoices",{
headers:{ Authorization:"Bearer " + token }
});

const invoices = await res.json();

const clients = new Set();
let revenue = 0;
let outstanding = 0;

const monthlyRevenue = {
Jan:0, Feb:0, Mar:0, Apr:0, May:0, Jun:0,
Jul:0, Aug:0, Sep:0, Oct:0, Nov:0, Dec:0
};

// ============================
// PROCESS INVOICES
// ============================

invoices.forEach(inv => {

const name = inv.client_name || inv.client || "";
const amount = Number(inv.total || 0);
const status = (inv.status || "").toLowerCase();

if(name){
clients.add(name);
}

if(status === "paid"){
revenue += amount;
}

if(status === "pending" || status === "overdue"){
outstanding += amount;
}

const date = new Date(inv.created_at || inv.date);
const month = date.toLocaleString("default",{month:"short"});

if(monthlyRevenue[month] !== undefined){
monthlyRevenue[month] += amount;
}

});

// ============================
// UPDATE KPIs
// ============================

document.getElementById("totalClients").textContent = clients.size;
document.getElementById("activeClients").textContent = clients.size;
document.getElementById("totalRevenue").textContent = formatMoney(revenue);
document.getElementById("outstanding").textContent = formatMoney(outstanding);

// ============================
// RECENT INVOICES TABLE
// ============================

const table = document.getElementById("invoiceTable");
if(table){

table.innerHTML = "";

invoices
.sort((a,b)=> new Date(b.created_at) - new Date(a.created_at))
.slice(0,5)
.forEach(inv => {

const status = (inv.status || "pending").toLowerCase();
const invoice = inv.id || "";
const client = inv.client_name || inv.client || "";
const total = Number(inv.total || 0).toLocaleString();

table.insertAdjacentHTML("beforeend",`

<tr>
<td>#${invoice}</td>
<td>${client}</td>
<td class="status ${status}">${status}</td>
<td>${formatMoney(Number(inv.total || 0))}</td>
</tr>

`);

});

}

// ============================
// DRAW CHART
// ============================

drawRevenueChart(monthlyRevenue);

}catch(err){

console.error("Dashboard error:", err);

}

}

// =============================
// DRAW REVENUE CHART
// =============================

let revenueChart = null;

function drawRevenueChart(monthlyRevenue){

const ctx = document.getElementById("revenueChart");

if(!ctx) return;

if(revenueChart){
revenueChart.destroy();
}

revenueChart = new Chart(ctx,{
type:"line",

data:{
labels:Object.keys(monthlyRevenue),

datasets:[{
label:"Revenue",
data:Object.values(monthlyRevenue),
borderColor:"#4f46e5",
backgroundColor:"rgba(79,70,229,0.2)",
fill:true,
tension:0.4
}]
},

options:{
responsive:true,
plugins:{legend:{display:false}},
scales:{y:{beginAtZero:true}}
}

});

}

// =============================
// FORMAT CURRENCY
// =============================

function formatCurrency(amount){
return formatMoney(amount);
}


const searchInput = document.getElementById("globalSearch");
const results = document.getElementById("searchResults");

const suggestions = [

/* Pages */

{ name:"Dashboard", link:"dashboard.html" },
{ name:"Clients", link:"clients.html" },
{ name:"Invoices", link:"invoices.html" },
{ name:"Settings", link:"company-settings.html" },

/* Dashboard Sections */

{ name:"Total Clients", section:"totalClientsCard" },
{ name:"Active Clients", section:"activeClientsCard" },
{ name:"Total Revenue", section:"totalRevenueCard" },
{ name:"Outstanding", section:"outstandingCard" },
{ name:"Revenue Overview", section:"revenueChartSection" },
{ name:"Recent Invoices", section:"recentInvoices" }

];

searchInput.addEventListener("input", function(){

const term = this.value.toLowerCase().trim();

results.innerHTML = "";

if(term === ""){
results.style.display = "none";
return;
}

const matches = suggestions.filter(item =>
item.name.toLowerCase().includes(term)
);

matches.forEach(match => {

const div = document.createElement("div");
div.textContent = match.name;

div.onclick = () => {

searchInput.value = match.name;
results.style.display = "none";

/* Navigate pages */

if(match.link){
window.location.href = match.link;
}

/* Scroll to section */

if(match.section){
const section = document.getElementById(match.section);
if(section){
section.scrollIntoView({behavior:"smooth"});
}
}

};

results.appendChild(div);

});

results.style.display = matches.length ? "block" : "none";

});

/* close search when clicking outside */

document.addEventListener("click", function(e){

if(!searchInput.contains(e.target) && !results.contains(e.target)){
results.style.display = "none";
}

});



















