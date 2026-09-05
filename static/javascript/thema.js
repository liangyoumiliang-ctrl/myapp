document.addEventListener("DOMContentLoaded", () => {
    const themeButton = document.getElementById("theme-toggle");

    const savedTheme = localStorage.getItem("theme");

    if (savedTheme === "light") {
        document.body.classList.add("light-mode");
        themeButton.textContent = "☽";
    } else {
        themeButton.textContent = "☀︎";
    }

    themeButton.addEventListener("click", (event) => {
        event.preventDefault();

        document.body.classList.toggle("light-mode");

        if (document.body.classList.contains("light-mode")) {

            localStorage.setItem("theme", "light");

            // ライトモード中なので「ダークに変更」と表示
            themeButton.textContent = "☽";

        } else {

            localStorage.setItem("theme", "dark");

            // ダークモード中なので「ライトに変更」と表示
            themeButton.textContent = "☀︎";
        }
    });
});