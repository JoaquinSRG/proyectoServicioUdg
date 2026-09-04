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

// f.ids trae todos los ids de formulario fusionados bajo el mismo nombre
// (mismo formulario asignado a varios usuarios/deptos => varias hojas).
// Se muestra un solo botón (la primera hoja disponible).
function botonesHoja(f) {
  const sheet = (f.ids || [f.id]).map(sheetIdDe).find(Boolean);
  if (!sheet) return "";
  return `<button type="button" class="resp-sheet-btn" data-sheet="${esc(sheet)}" data-nombre="${esc(f.nombre)}">Editar hoja</button>`;
}

function bloqueForm(f, count, contenido, abierto) {
  return (
    `<div class="resp-block${abierto ? " is-open" : ""}">` +
    `<div class="resp-form-row">` +
    `<button type="button" class="resp-form">` +
    `<span class="resp-chevron">▸</span> ${esc(f.nombre)} <span class="resp-count">(${count})</span>` +
    `</button>` +
    botonesHoja(f) +
    `</div>` +
    `<div class="resp-body">${contenido}</div>` +
    `</div>`
  );
}

// El mismo formulario puede existir como varias filas en la BD (una por
// usuario/departamento al que se le asignó, cada una con su propia hoja de
// respuestas), así que aparece repetido al listar por departamento. Se
// fusionan por nombre y se combinan sus filas en un solo bloque.
function mergeDuplicados(formularios) {
  const grupos = new Map();
  for (const f of formularios) {
    const key = f.nombre.trim().toLowerCase();
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(f);
  }
  return [...grupos.values()].map((grupo) => {
    if (grupo.length === 1) return grupo[0];
    const conHoja = grupo.filter((f) => f.tiene_sheet);
    const rows = conHoja.flatMap((f) => f.rows);
    return {
      id: grupo[0].id,
      ids: grupo.map((f) => f.id),
      nombre: grupo[0].nombre,
      id_departamento: grupo[0].id_departamento,
      tiene_sheet: conHoja.length > 0,
      headers: (conHoja[0] || grupo[0]).headers,
      rows,
      total: rows.length,
      error: conHoja.length ? null : grupo[0].error,
    };
  });
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
  return bloqueForm(f, f.total, contenido, abierto);
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
  return bloqueForm(f, count, contenido, abierto);
}

// Igual que embedUrl() en subJefesDashboard.js, pero para Sheets: se abre en
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
    const formularios = mergeDuplicados(data.formularios);
    out.innerHTML =
      `<h2 class="resp-title">Respuestas · ${esc(data.departamento)}</h2>` +
      (formularios.length
        ? formularios.map((f) => renderForm(f, abierto)).join("")
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
    const formularios = mergeDuplicados(data.formularios);
    const email = u.email.trim().toLowerCase();
    out.innerHTML =
      `<h2 class="resp-title">Respuestas · ${esc(u.nombre)} <span class="resp-count">(${esc(u.email)})</span></h2>` +
      (formularios.length
        ? formularios
            .map((f) => renderRespUsuario(f, email, abierto))
            .join("")
        : `<p class="resp-empty">El departamento de este usuario no tiene formularios.</p>`);
  });
}
