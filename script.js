document.getElementById("year").textContent = new Date().getFullYear();

// Placeholder handler: the form does not send anywhere yet.
// Connect it to a form service or backend (e.g. Formspree, Netlify Forms) before launch.
document.getElementById("quote-form").addEventListener("submit", function (e) {
  e.preventDefault();
  document.getElementById("form-note").textContent =
    "Thanks! Form submission isn't connected yet. Add a form service before launch.";
});
