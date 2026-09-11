const userMenuButton = document.getElementById("user-menu-button");
const userDropdown = document.getElementById("user-dropdown");

if (userMenuButton && userDropdown) {

  userMenuButton.addEventListener("click", () => {
    userDropdown.classList.toggle("open");
  });

}