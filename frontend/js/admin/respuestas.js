import { api, $, esc, on, notify } from "../core.js";
import { cachedForms } from "./formularios.js";

const trimHeaders = (hs) => {
  const h = [...hs];
  while (h.length && !h[h.length - 1].trim()) h.pop();
  return h;
};

// El endpoint de respuestas no manda el sheet_id; lo buscamos en la lista
// de formularios que ya carga formularios.js (mismo id de formulario).
function sheetIdDe(formId) {
  const f = cachedForms.find((x) => x.id === formId);
  return f && f.sheet_id;
}

function botonHoja(sheetId, nombre) {
  if (!sheetId) return "";
  return `<button type="button" class="resp-sheet-btn" data-sheet="${esc(sheetId)}" data-nombre="${esc(nombre)}">Editar hoja</button>`;
}

function bloqueForm(id, nombre, count, contenido, abierto) {
  return (
    `<div class="resp-block${abierto ? " is-open" : ""}">` +
    `<div class="resp-form-row">` +
    `<button type="button" class="resp-form">` +
    `<span class="resp-chevron">▸</span> ${esc(nombre)} <span class="resp-count">(${count})</span>` +
    `</button>` +
    botonHoja(sheetIdDe(id), nombre) +
    `</div>` +
    `<div class="resp-body">${contenido}</div>` +
    `</div>`
  );
}

function renderForm(f, abierto) {
  let contenido;
  if (!f.tiene_sheet)
    contenido = `<p class="resp-empty">${esc(f.error || "Sin hoja de respuestas vinculada.")}</p>`;
  else if (!f.rows.length)
    contenido = `<p class="resp-empty">Sin respuestas todavía.</p>`;
  else {
    const headers = trimHeaders(f.headers);
    const n = headers.length;
    const thead = `<tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
    const tbody = f.rows
      .map((r) => `<tr>${r.slice(0, n).map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join("");
    contenido = `<div class="resp-scroll"><table class="resp-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
  }
  return bloqueForm(f.id, f.nombre, f.total, contenido, abierto);
}

function renderRespUsuario(f, email, abierto) {
  let contenido, count = 0;
  if (!f.tiene_sheet)
    contenido = `<p class="resp-empty">${esc(f.error || "Sin hoja de respuestas vinculada.")}</p>`;
  else {
    const idx = f.headers.findIndex((h) => /correo|mail/i.test(h));
    if (idx === -1)
      contenido = `<p class="resp-empty">La hoja no recopila correo; no se puede identificar al usuario.</p>`;
    else {
      const filas = f.rows.filter(
        (r) => (r[idx] || "").trim().toLowerCase() === email,
      );
      count = filas.length;
      if (!filas.length)
        contenido = `<p class="resp-empty">Pendiente · este usuario no ha contestado.</p>`;
      else {
        const headers = trimHeaders(f.headers);
        const n = headers.length;
        const thead = `<tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
        const tbody = filas
          .map((r) => `<tr>${r.slice(0, n).map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
          .join("");
        contenido = `<div class="resp-scroll"><table class="resp-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
      }
    }
  }
  return bloqueForm(f.id, f.nombre, count, contenido, abierto);
}

// Igual que embedUrl() en userDashboard.js, pero para Sheets: se abre en
// modo edición para que el admin pueda corregir datos directamente.
function sheetEditUrl(sheetId) {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/edit?usp=sharing`;
}

const sheetPanel = $("sheetPanel");
const sheetFrame = $("sheetFrame");
const sheetTitle = $("sheetTitle");

function closeSheetPanel() {
  sheetPanel.classList.remove("open");
  sheetFrame.src = "";
}

function openSheetPanel(sheetId, nombre) {
  sheetTitle.textContent = nombre;
  sheetFrame.src = sheetEditUrl(sheetId);
  sheetPanel.classList.add("open");
}

$("sheetClose").addEventListener("click", closeSheetPanel);

// Event delegation — avoids inline onclick in generated HTML
function attachToggle(containerId) {
  $(containerId).addEventListener("click", (e) => {
    const sheetBtn = e.target.closest(".resp-sheet-btn");
    if (sheetBtn) {
      openSheetPanel(sheetBtn.dataset.sheet, sheetBtn.dataset.nombre);
      return;
    }
    const btn = e.target.closest(".resp-form");
    if (btn) btn.closest(".resp-block").classList.toggle("is-open");
  });
}

export function initRespDeptos() {
  attachToggle("respOut");

  on("rVer", async () => {
    const id = $("rDepto").value;
    if (!id) return notify("Selecciona un departamento.", "error");
    const abierto = $("rExpandir").checked;
    const out = $("respOut");
    out.classList.remove("resp-placeholder");
    out.innerHTML = `<p class="resp-empty">Cargando…</p>`;
    const data = await api(`/departamentos/${id}/respuestas`);
    out.innerHTML =
      `<h2 class="resp-title">Respuestas · ${esc(data.departamento)}</h2>` +
      (data.formularios.length
        ? data.formularios.map((f) => renderForm(f, abierto)).join("")
        : `<p class="resp-empty">Este departamento no tiene formularios.</p>`);
  });
}

let usuariosCache = [];
let deptoIdPorNombre = {};

export async function initRespUsuario() {
  attachToggle("ruOut");

  const [usuarios, deptos] = await Promise.all([
    api("/usuarios"),
    api("/departamentos"),
  ]);
  usuariosCache = usuarios;
  deptoIdPorNombre = Object.fromEntries(deptos.map((d) => [d.nombre, d.id]));
  $("ruUsuario").innerHTML = usuarios
    .map(
      (u) =>
        `<option value="${u.id}">#${u.id} · ${esc(u.nombre)} — ${esc(u.departamento)}</option>`,
    )
    .join("");

  on("ruVer", async () => {
    const uid = $("ruUsuario").value;
    if (!uid) return notify("Selecciona un usuario.", "error");
    const u = usuariosCache.find((x) => String(x.id) === uid);
    const deptoId = deptoIdPorNombre[u.departamento];
    const abierto = $("ruExpandir").checked;
    const out = $("ruOut");
    out.classList.remove("resp-placeholder");
    out.innerHTML = `<p class="resp-empty">Cargando…</p>`;

    if (!deptoId) {
      out.innerHTML = `<p class="resp-empty">Este usuario no tiene un departamento con formularios.</p>`;
      return;
    }

    const data = await api(`/departamentos/${deptoId}/respuestas`);
    const email = u.email.trim().toLowerCase();
    out.innerHTML =
      `<h2 class="resp-title">Respuestas · ${esc(u.nombre)} <span class="resp-count">(${esc(u.email)})</span></h2>` +
      (data.formularios.length
        ? data.formularios
            .map((f) => renderRespUsuario(f, email, abierto))
            .join("")
        : `<p class="resp-empty">El departamento de este usuario no tiene formularios.</p>`);
  });
}
