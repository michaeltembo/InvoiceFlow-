document.addEventListener("DOMContentLoaded", () => {

const menuBtn = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");

menuBtn.addEventListener("click", () => {

if (sidebar.style.left === "0px") {
sidebar.style.left = "-250px";
} else {
sidebar.style.left = "0px";
}

});

});
