import { api, $, on, esc, requireAuth } from "../core.js";
import { initFormularios, initProgramar } from "./formularios.js";
import { initUsuarios } from "./usuarios.js";
import { initRespDeptos, initRespUsuario } from "./respuestas.js";

requireAuth();

on("logOut", () => {
  localStorage.clear();
  location.href = "index.html";
});

$("modalClose").onclick = () => $("modal").close();
$("modal").onclick = (e) => e.target === $("modal") && $("modal").close();

api("/perfil")
  .then((me) => ($("userName").textContent = me.usuario))
  .catch(() => {});

async function loadDeptos() {
  const ds = await api("/departamentos");

  const optsForm = ds
    .filter((d) => d.codigo !== "admin")
    .map(
      (d) =>
        `<option value="${d.id}">#${d.id} · ${esc(d.nombre)} (${esc(d.codigo)})</option>`,
    )
    .join("");
  document.querySelectorAll(".depto").forEach((s) => (s.innerHTML = optsForm));
  $("eDepto").insertAdjacentHTML(
    "afterbegin",
    `<option value="" selected>— no cambiar —</option>`,
  );

  const optsUser = ds
    .map(
      (d) =>
        `<option value="${d.id}">#${d.id} · ${esc(d.nombre)} (${esc(d.codigo)})</option>`,
    )
    .join("");
  document
    .querySelectorAll(".depto-user")
    .forEach((s) => (s.innerHTML = optsUser));
  $("ueDepto").insertAdjacentHTML(
    "afterbegin",
    `<option value="" selected>— no cambiar —</option>`,
  );
}

loadDeptos();
initFormularios();
initProgramar();
initUsuarios();
initRespDeptos();
initRespUsuario();

document.querySelectorAll(".card-header").forEach((header) => {
  header.addEventListener("click", () => {
    const card = header.closest(".card");
    const collapsed = card.classList.toggle("collapsed");
    header.querySelector(".card-toggle").setAttribute("aria-expanded", String(!collapsed));
  });
});

requestAnimationFrame(() => {
  const cards = [...document.querySelectorAll(".col-left .card")];
  const maxW = Math.max(...cards.map((c) => c.offsetWidth));
  cards.forEach((c) => (c.style.minWidth = maxW + "px"));
});
