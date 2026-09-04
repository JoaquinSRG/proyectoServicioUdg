import { api, $, esc, on, notify } from "../core.js";

const trimHeaders = (hs) => {
  const h = [...hs];
  while (h.length && !h[h.length - 1].trim()) h.pop();
  return h;
};

// El mismo formulario puede existir como varias filas en la BD (una por
// usuario al que se le asignó, cada una con su propia hoja de respuestas),
// así que aparece repetido al listar por departamento. Se fusionan por
// nombre y se combinan sus filas.
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

function bloqueForm(nombre, count, contenido, abierto) {
  return (
    `<div class="resp-block${abierto ? " is-open" : ""}">` +
    `<div class="resp-form-row">` +
    `<button type="button" class="resp-form">` +
    `<span class="resp-chevron">▸</span> ${esc(nombre)} <span class="resp-count">(${count})</span>` +
    `</button>` +
    `</div>` +
    `<div class="resp-body">${contenido}</div>` +
    `</div>`
  );
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
  return bloqueForm(f.nombre, count, contenido, abierto);
}

function attachToggle(containerId) {
  $(containerId).addEventListener("click", (e) => {
    const btn = e.target.closest(".resp-form");
    if (btn) btn.closest(".resp-block").classList.toggle("is-open");
  });
}

export async function initRespUsuario() {
  attachToggle("ruOut");

  const [me, deptos] = await Promise.all([api("/perfil"), api("/departamentos")]);
  const miDepto = deptos.find((d) => d.codigo === me.departamento_tag);
  if (!miDepto) return;
  const deptoIdPorNombre = Object.fromEntries(deptos.map((d) => [d.nombre, d.id]));

  const usuarios = await api("/usuarios");

  $("ruUsuario").innerHTML = usuarios
    .map(
      (u) =>
        `<option value="${u.id}">#${u.id} · ${esc(u.nombre)} — ${esc(u.departamento)}</option>`,
    )
    .join("");

  on("ruVer", async () => {
    const uid = $("ruUsuario").value;
    if (!uid) return notify("Selecciona un usuario.", "error");
    const u = usuarios.find((x) => String(x.id) === uid);
    const deptoId = deptoIdPorNombre[u.departamento];
    const abierto = $("ruExpandir").checked;
    const out = $("ruOut");
    out.classList.remove("resp-placeholder");
    out.innerHTML = `<p class="resp-empty">Cargando…</p>`;

    const data = await api(`/departamentos/${miDepto.id}/respuestas`);
    const email = u.email.trim().toLowerCase();
    const formularios = mergeDuplicados(
      data.formularios.filter((f) => f.id_departamento === deptoId),
    );
    out.innerHTML =
      `<h2 class="resp-title">Respuestas · ${esc(u.nombre)} <span class="resp-count">(${esc(u.email)})</span></h2>` +
      (formularios.length
        ? formularios.map((f) => renderRespUsuario(f, email, abierto)).join("")
        : `<p class="resp-empty">El departamento de este usuario no tiene formularios.</p>`);
  });
}
