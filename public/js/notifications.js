document.addEventListener("DOMContentLoaded", () => {
  const notifBtn = document.getElementById("notifButton");
  const notifDropdown = document.getElementById("notifDropdown");

  console.log("Script loaded"); // ✅ Test line

  notifBtn.addEventListener("click", () => {
    console.log("Button clicked"); // ✅ Test line
    notifDropdown.classList.toggle("hidden");
  });
});
