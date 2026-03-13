function getToken(){
return localStorage.getItem("token")
}

// =======================
// LOAD TRASH
// =======================

const trash = JSON.parse(localStorage.getItem("trash")) || []

const table = document.getElementById("trashTable")

trash.forEach((item,i)=>{

table.insertAdjacentHTML("beforeend",`
<tr>
<td>${item.data?.name || item.data?.invoice || "Item"}</td>
<td>
<button onclick="restoreItem(${i})">Restore</button>
<button onclick="deleteForever(${i})">Delete</button>
</td>
</tr>
`)

})

// =======================
// RESTORE ITEM
// =======================

async function restoreItem(index){

let trash = JSON.parse(localStorage.getItem("trash")) || []
let item = trash[index]

if(!item) return

const token = localStorage.getItem("token")

try{

if(item.type === "client"){

await fetch("/clients",{
method:"POST",
headers:{
"Content-Type":"application/json",
"Authorization":"Bearer "+token
},
body:JSON.stringify(item.data)
})

}

if(item.type === "invoice"){

const inv = item.data

await fetch("/invoices",{
method:"POST",
headers:{
"Content-Type":"application/json",
"Authorization":"Bearer "+token
},
body:JSON.stringify({
client_id: inv.client_id,
created_at: inv.created_at,
due_date: inv.due_date,
status: inv.status || "pending",
tax_rate: inv.tax_rate || 0,
items: inv.items || [
{
description:"Restored invoice",
quantity:1,
price:inv.total || 0
}
]
})
})

}

trash.splice(index,1)

localStorage.setItem("trash", JSON.stringify(trash))

location.reload()

}catch(err){

console.error(err)
alert("Restore failed")

}

}

// =======================
// DELETE FOREVER
// =======================

function deleteForever(index){

let trash = JSON.parse(localStorage.getItem("trash")) || []

trash.splice(index,1)

localStorage.setItem("trash", JSON.stringify(trash))

location.reload()

}
