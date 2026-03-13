function setupSidebar(){

  fetch("sidebar.html")
  .then(res => res.text())
  .then(data => {

    const container = document.getElementById("sidebar-container");
    container.innerHTML = data;

    const menuBtn = document.getElementById("menuBtn");
    const sidebar = document.getElementById("sidebar");

    if(menuBtn && sidebar){
      menuBtn.addEventListener("click", () => {
        sidebar.classList.toggle("collapsed");
      });
    }

    const logoutBtn = document.getElementById("logoutBtn");

    if(logoutBtn){
      logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("token");
        window.location.href="login.html";
      });
    }

  });

}

document.addEventListener("DOMContentLoaded", setupSidebar);

let startX = 0;
let endX = 0;

const menuBtn = document.getElementById("menuBtn");

document.addEventListener("touchstart", (e) => {
startX = e.touches[0].clientX;
});

document.addEventListener("touchend", (e) => {
endX = e.changedTouches[0].clientX;

if(endX - startX > 80){
menuBtn.classList.add("show");
}
});
