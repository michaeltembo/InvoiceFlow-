console.log("REPORTS JS LOADED");

let revenueChart, profitChart, statusChart;

document.addEventListener("DOMContentLoaded", () => {
  loadReports();
});

let allInvoices = [];

async function loadReports() {
  const token = localStorage.getItem("token");

  const res = await fetch("/reports", {
    headers: { Authorization: "Bearer " + token }
  });

  const data = await res.json();

  allInvoices = data.invoices;

  processData(allInvoices, data.totalClients);
}


// 🔥 MAIN PROCESSOR
function processData(invoices, totalClients = 0) {

  let revenue = 0;
  let outstanding = 0;

  let paid = 0, pending = 0, overdue = 0;

  const monthly = {
    Jan:0, Feb:0, Mar:0, Apr:0, May:0, Jun:0,
    Jul:0, Aug:0, Sep:0, Oct:0, Nov:0, Dec:0
  };

  const clientsMap = {};

invoices.forEach(inv => {

  const amount = Number(inv.total) || 0;

  // ✅ FIX: normalize status
  const status = (inv.status || "").toLowerCase();

  // ✅ FIX: safe client name
  const name = inv.client_name || "Unknown";

  // DATE
  const date = new Date(inv.created_at);
  const month = date.toLocaleString('default', { month: 'short' });

  // ✅ STATUS + REVENUE (ONLY PAID COUNTS)
  if (status === "paid") {
    revenue += amount;
    monthly[month] += amount;
    paid++;
  } else if (status === "pending") {
    outstanding += amount;
    pending++;
  } else if (status === "overdue") {
    outstanding += amount;
    overdue++;
  }

  // ✅ CLIENTS (NO CRASH)
  if (!clientsMap[name]) {
    clientsMap[name] = { total:0, count:0 };
  }

  clientsMap[name].total += amount;
  clientsMap[name].count++;
});



  // 📊 GROWTH + BEST MONTH
  const values = Object.values(monthly);
  const bestMonthIndex = values.indexOf(Math.max(...values));
  const bestMonth = Object.keys(monthly)[bestMonthIndex];

  console.log("Best Month:", bestMonth);

  // 💸 EXPENSES (temporary logic)
  const expenses = revenue * 0.3;
  const profit = revenue - expenses;

  console.log("Profit:", profit);

// 💰 FORMAT FUNCTION
const format = n => "ZMW " + n.toLocaleString();

// 📊 UPDATE UI
document.getElementById("revenue").innerText = format(revenue);
document.getElementById("outstanding").innerText = format(outstanding);
document.getElementById("invoices").innerText = invoices.length;
document.getElementById("clients").innerText = totalClients;
// 📈 REVENUE CHART
if (revenueChart) revenueChart.destroy();

revenueChart = new Chart(document.getElementById("revenueChart"), {
  type: "line",
  data: {
    labels: Object.keys(monthly),
    datasets: [{
      label: "Monthly Revenue",
      data: Object.values(monthly)
    }]
  }
});

// 💸 PROFIT
if (profitChart) profitChart.destroy();

profitChart = new Chart(document.getElementById("profitChart"), {
  type: "bar",
  data: {
    labels: ["Income", "Expenses", "Profit"],
    datasets: [{
      data: [revenue, expenses, profit]
    }]
  }
});

// 🧾 STATUS
if (statusChart) statusChart.destroy();

statusChart = new Chart(document.getElementById("statusChart"), {
  type: "pie",
  data: {
    labels: ["Paid", "Pending", "Overdue"],
    datasets: [{
      data: [paid, pending, overdue]
    }]
  }
});


const table = document.getElementById("topClients");
table.innerHTML = "";

sorted.forEach(([name, data]) => {

  const initials = (name || "U")
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase();

  const formatCurrency = (n) => {
    return "ZMW " + Number(n || 0).toLocaleString();
  };

  table.innerHTML += `
    <tr>
      <td>
        <div class="client-cell">
          <div class="avatar">${initials}</div>
          <div>
            <div class="name">${name}</div>
            <div class="sub-text">Client</div>
          </div>
        </div>
      </td>

      <td class="money">${formatCurrency(data.total)}</td>

      <td>${data.count}</td>
    </tr>
  `;
});


// =============================
// ⏱️ TIME FILTER LOGIC
// =============================

function setRange(type) {
  const now = new Date();
  let filtered = [];

  if (type === "month") {
    filtered = allInvoices.filter(inv => {
      const d = new Date(inv.created_at);
      return d.getMonth() === now.getMonth();
    });
  }

  if (type === "30days") {
    const past = new Date();
    past.setDate(now.getDate() - 30);

    filtered = allInvoices.filter(inv => {
      const d = new Date(inv.created_at);
      return d >= past;
    });
  }

  if (type === "year") {
    filtered = allInvoices.filter(inv => {
      const d = new Date(inv.created_at);
      return d.getFullYear() === now.getFullYear();
    });
  }

  processData(filtered);
}


function applyCustomRange() {
  const from = new Date(document.getElementById("fromDate").value);
  const to = new Date(document.getElementById("toDate").value);

  const filtered = allInvoices.filter(inv => {
    const d = new Date(inv.created_at);
    return d >= from && d <= to;
  });

  processData(filtered);
}








