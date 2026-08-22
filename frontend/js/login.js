import { API, api } from "./core.js";

const form = document.getElementById("loginForm");
const errorMsg = document.getElementById("errorMsg");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorMsg.style.display = "none";

  const email = document.getElementById("user").value;
  const password = document.getElementById("password").value;

  // OAuth2PasswordRequestForm exige form-urlencoded con 'username' y 'password',
  // por eso este fetch va "a mano" y no usa api() (que manda JSON + Bearer).
  const body = new URLSearchParams();
  body.append("username", email);
  body.append("password", password);

  try {
    const res = await fetch(`${API}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Credenciales incorrectas");
    }

    const data = await res.json(); // { access_token, token_type }
    localStorage.setItem("token", data.access_token);

    // Ya con token guardado, el resto sí usa el helper compartido.
    const perfil = await api("/perfil");

    location.href =
      perfil.departamento_tag === "admin"
        ? "adminDashboard.html"
        : perfil.acces === 1
        ? "jefesDashboard.html"
        : "subJefesDashboard.html";
  } catch (err) {
    errorMsg.textContent = err.message;
    errorMsg.style.display = "block";
  }
});
