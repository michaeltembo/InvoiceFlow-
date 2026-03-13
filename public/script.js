document.addEventListener("DOMContentLoaded", function () {

  const form = document.getElementById("clientForm");

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const input = document.getElementById("clientName");

    console.log("INPUT ELEMENT:", input);
    console.log("INPUT VALUE:", input.value);

    const name = input.value.trim();

    if (!name) {
      alert("Client name required");
      return;
    }

    alert("Name captured: " + name);
  });

});


