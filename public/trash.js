alert("TRASH JS LOADED");

function getToken(){
  return localStorage.getItem("token");
}

// =======================
// LOAD TRASH FROM SERVER
// =======================

document.addEventListener("DOMContentLoaded", () => {

  const token = localStorage.getItem("token");

  console.log("TOKEN:", token);

  if (!token) {
    alert("Please login first");
    window.location.href = "/login.html";
    return;
  }

  loadTrash(token);
});


async function loadTrash(token){

  try{

    const res = await fetch("/recycle-bin", { // ✅ FIXED HERE
      headers: {
        Authorization: "Bearer " + token
      }
    });

    const data = await res.json();

    console.log("DATA:", data); // 🔥 DEBUG

    const table = document.getElementById("trashTable");
    table.innerHTML = "";

    data.clients.forEach(client => {
      table.insertAdjacentHTML("beforeend",`
        <tr>
          <td>${client.name}</td>
          <td>Client</td>
          <td>
            <button onclick="restoreClient(${client.id})">Restore</button>
          </td>
        </tr>
      `);
    });

    data.invoices.forEach(inv => {
      table.insertAdjacentHTML("beforeend",`
        <tr>
          <td>Invoice #${inv.id}</td>
          <td>Invoice</td>
          <td>
            <button onclick="restoreInvoice(${inv.id})">Restore</button>
          </td>
        </tr>
      `);
    });

  }catch(err){
    console.error("ERROR:", err);
    alert("Failed to load recycle bin");
  }
}

    // =======================
    // CLIENTS
    // =======================

    data.clients.forEach(client => {

      table.insertAdjacentHTML("beforeend",`
        <tr>
          <td>${client.name || "Client"}</td>
          <td>
            <button onclick="restoreClient(${client.id})">Restore</button>
            <button onclick="deleteClientForever(${client.id})">Delete</button>
          </td>
        </tr>
      `);

    });

    // =======================
    // INVOICES
    // =======================

    data.invoices.forEach(inv => {

      table.insertAdjacentHTML("beforeend",`
        <tr>
          <td>INV-${inv.id}</td>
          <td>
            <button onclick="restoreInvoice(${inv.id})">Restore</button>
            <button onclick="deleteInvoiceForever(${inv.id})">Delete</button>
          </td>
        </tr>
      `);

    });

  }catch(err){

    console.error("TRASH LOAD ERROR:", err);
    alert("Failed to load recycle bin");

  }

}

// =======================
// RESTORE CLIENT
// =======================

async function restoreClient(id){

  const token = localStorage.getItem("token");

  await fetch(`/restore/client/${id}`,{
    method:"POST",
    headers:{ Authorization:"Bearer "+token }
  });

  loadTrash();
}

async function restoreInvoice(id){

  const token = localStorage.getItem("token");

  await fetch(`/restore/invoice/${id}`,{
    method:"POST",
    headers:{ Authorization:"Bearer "+token }
  });

  loadTrash();
}


// =======================
// RESTORE INVOICE
// =======================

async function restoreInvoice(id){

  const token = getToken();

  try{

    const res = await fetch(`/restore/invoice/${id}`,{
      method:"POST",
      headers:{
        Authorization:"Bearer "+token
      }
    });

    if(!res.ok){
      throw new Error("Restore failed");
    }

    loadTrash();

  }catch(err){

    console.error(err);
    alert("Failed to restore invoice");

  }

}

// =======================
// DELETE CLIENT FOREVER
// =======================

async function deleteClientForever(id){

  const token = getToken();

  if(!confirm("Delete client permanently?")) return;

  try{

    const res = await fetch(`/permanent/client/${id}`,{
      method:"DELETE",
      headers:{
        Authorization:"Bearer "+token
      }
    });

    if(!res.ok){
      throw new Error("Delete failed");
    }

    loadTrash();

  }catch(err){

    console.error(err);
    alert("Failed to delete client");

  }

}

// =======================
// DELETE INVOICE FOREVER
// =======================

async function deleteInvoiceForever(id){

  const token = getToken();

  if(!confirm("Delete invoice permanently?")) return;

  try{

    const res = await fetch(`/permanent/invoice/${id}`,{
      method:"DELETE",
      headers:{
        Authorization:"Bearer "+token
      }
    });

    if(!res.ok){
      throw new Error("Delete failed");
    }

    loadTrash();

  }catch(err){

    console.error(err);
    alert("Failed to delete invoice");

  }

}

// =======================
// INIT
// =======================

loadTrash();
