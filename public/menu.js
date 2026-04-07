

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





function logout() {
  localStorage.removeItem("token");
  window.location.href = "/login.html";
}




function goBack(){
window.history.back()
}














// =============================
// LOAD SAVED THEME
// =============================
document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme");

  if (savedTheme === "dark") {
    document.body.classList.add("dark");
  }

  // SYSTEM DARK MODE (FIXED)
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  if (!savedTheme && prefersDark) {
    document.body.classList.add("dark");
  }
});


// =============================
// TOGGLE THEME
// =============================
function toggleTheme() {
  document.body.classList.toggle("dark");

  if (document.body.classList.contains("dark")) {
    localStorage.setItem("theme", "dark");
  } else {
    localStorage.setItem("theme", "light");
  }
}

