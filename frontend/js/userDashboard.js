import { api, $, esc, on, requireAuth, safeUrl } from "./core.js";

requireAuth();

on("logOut", () => {
  localStorage.clear();
  location.href = "index.html";
});

api("/perfil")
  .then((me) => ($("userName").textContent = me.usuario))
  .catch(() => {});

function embedUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.hostname === "docs.google.com" && u.pathname.includes("/forms/")) {
      u.searchParams.set("embedded", "true");
      return u.toString();
    }
  } catch {}
  return null;
}

const layout = $("mainLayout");
const frame = $("formFrame");
const expandTitle = $("expandTitle");
let activeCard = null;

function closePanel() {
  layout.classList.remove("split-open");
  frame.src = "";
  if (activeCard) { activeCard.classList.remove("active"); activeCard = null; }
}

on("expandClose", closePanel);

$("forms").addEventListener("click", (e) => {
  const card = e.target.closest(".form-card");
  if (!card) return;

  if (activeCard === card) { closePanel(); return; }

  const url = embedUrl(card.dataset.link);
  if (!url) { window.open(card.dataset.link, "_blank", "noopener"); return; }

  if (activeCard) activeCard.classList.remove("active");
  activeCard = card;
  card.classList.add("active");

  expandTitle.textContent = card.dataset.nombre;
  frame.src = url;
  layout.classList.add("split-open");
});

(async () => {
  try {
    const forms = await api("/formularios/mis-formularios");
    if (!forms) return;
    $("forms").innerHTML = forms.length
      ? forms
          .map(
            (f) =>
              `<button class="form-card" data-link="${esc(safeUrl(f.link))}" data-nombre="${esc(f.nombre)}">
                 ${esc(f.nombre)}
                 <span class="dept">${esc(f.nombre_departamento)}</span>
               </button>`,
          )
          .join("")
      : `<div class="empty">No tienes formularios asignados por el momento.</div>`;
  } catch (e) {
    $("forms").innerHTML =
      `<div class="empty">Error al cargar: ${esc(e.message)}</div>`;
  }
})();
