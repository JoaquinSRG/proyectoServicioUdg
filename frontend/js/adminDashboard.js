import { api, $, val, esc, on, requireAuth } from "./core.js";

requireAuth();

// Acepta el link completo de Google Sheets o el ID pelón; devuelve solo el ID.
const sheetId = (s) => {
  const m = String(s).match(/\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : s.trim();
};

on("logOut", () => {
  localStorage.clear();
  location.href = "index.html";
});
$("modalClose").onclick = () => $("modal").close();
$("modal").onclick = (e) => e.target === $("modal") && $("modal").close();

// Muestra email de quién inició sesión
api("/perfil")
  .then((me) => ($("userName").textContent = me.usuario))
  .catch(() => {});

async function loadDeptos() {
  const ds = await api("/departamentos");

  // Selects de FORMULARIOS (.depto): ocultamos el depto de privilegios admin
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
    `<option value="">— no cambiar —</option>`,
  );

  // Select de USUARIOS (.depto-user): SÍ incluimos "admin", porque el
  // departamento es lo que da los permisos; asignar a alguien al depto admin
  // es la forma de crear otro administrador.
  const optsUser = ds
    .map(
      (d) =>
        `<option value="${d.id}">#${d.id} · ${esc(d.nombre)} (${esc(d.codigo)})</option>`,
    )
    .join("");
  document
    .querySelectorAll(".depto-user")
    .forEach((s) => (s.innerHTML = optsUser));
}
loadDeptos();

on("fCrear", async () => {
  const f = await api("/formularios", "POST", {
    nombre: val("fNombre"),
    link: val("fLink"),
    sheet_id: sheetId(val("fSheet")) || null,
    id_departamento: +val("fDepto"),
  });
  alert(
    `Éxito: formulario #${f.id} "${f.nombre}" añadido (${f.nombre_departamento}).`,
  );
});

on("fConsultar", async () => {
  const fs = await api("/formularios/mis-formularios");
  $("modalTitle").textContent = "Formularios existentes";
  $("modalBody").innerHTML = fs.length
    ? fs
        .map(
          (f) =>
            `<div class="modal-item">ID: ${esc(f.id)}<br>Nombre: ${esc(f.nombre)}<br>Link: <a href="${esc(/^https?:\/\//i.test(f.link) ? f.link : "#")}" target="_blank" rel="noopener">${esc(f.link)}</a><br>Sheet ID: ${esc(f.sheet_id || "—")}<br>Depto: ${esc(f.nombre_departamento)}</div>`,
        )
        .join("")
    : "No hay formularios.";
  $("modal").showModal();
});

on("eGuardar", async () => {
  const id = val("eId");
  if (!id) return alert("Falta el ID.");
  const c = {};
  if (val("eNombre")) c.nombre = val("eNombre");
  if (val("eLink")) c.link = val("eLink");
  if (val("eSheet")) c.sheet_id = sheetId(val("eSheet"));
  if ($("eDepto").value) c.id_departamento = +$("eDepto").value;
  const f = await api(`/formularios/${id}`, "PUT", c);
  alert(
    `Editado: #${f.id} "${f.nombre}" → ${f.link} (${f.nombre_departamento}).`,
  );
});

on("xBorrar", async () => {
  const id = val("xId");
  if (!id || !confirm(`¿Eliminar #${id}?`)) return;
  await api(`/formularios/${id}`, "DELETE");
  alert(`Formulario #${id} eliminado.`);
});

// ─── RESPUESTAS POR DEPARTAMENTO ───────────────────────────

on("rVer", async () => {
  const id = $("rDepto").value;
  if (!id) return alert("Selecciona un departamento.");
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

// Envuelve cada formulario en un bloque colapsable: cabecera con flecha
// (clic = desplegar/ocultar) + cuerpo. `abierto` define el estado inicial.
function bloqueForm(nombre, count, contenido, abierto) {
  return (
    `<div class="resp-block${abierto ? " is-open" : ""}">` +
    `<button type="button" class="resp-form" onclick="this.closest('.resp-block').classList.toggle('is-open')">` +
    `<span class="resp-chevron">▸</span> ${esc(nombre)} <span class="resp-count">(${count})</span>` +
    `</button>` +
    `<div class="resp-body">${contenido}</div>` +
    `</div>`
  );
}

// Cada formulario se renderiza por separado: su título + su propia tabla.
function renderForm(f, abierto) {
  let contenido;
  if (!f.tiene_sheet)
    contenido = `<p class="resp-empty">${esc(f.error || "Sin hoja de respuestas vinculada.")}</p>`;
  else if (!f.rows.length)
    contenido = `<p class="resp-empty">Sin respuestas todavía.</p>`;
  else {
    const thead = `<tr>${f.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
    const tbody = f.rows
      .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join("");
    contenido = `<div class="resp-scroll"><table class="resp-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
  }
  return bloqueForm(f.nombre, f.total, contenido, abierto);
}

// ─── USUARIOS ──────────────────────────────────────────────

on("uCrear", async () => {
  if (!val("uNombre") || !val("uEmail") || !val("uPass"))
    return alert("Nombre, correo y contraseña son obligatorios.");
  const u = await api("/usuarios/registrar", "POST", {
    nombre: val("uNombre"),
    email: val("uEmail"),
    password: val("uPass"),
    id_departamento: +val("uDepto"),
  });
  alert(
    `Éxito: usuario #${u.id} "${u.nombre}" registrado (${u.departamento}).`,
  );
});

on("uxBorrar", async () => {
  const id = val("uxId");
  if (!id || !confirm(`¿Eliminar usuario #${id}?`)) return;
  await api(`/usuarios/${id}`, "DELETE");
  alert(`Usuario #${id} eliminado.`);
});

on("uConsultar", async () => {
  const us = await api("/usuarios");
  $("modalTitle").textContent = "Usuarios existentes";
  $("modalBody").innerHTML = us.length
    ? us
        .map(
          (u) =>
            `<div class="modal-item">ID: ${esc(u.id)}<br>Nombre: ${esc(u.nombre)}<br>Correo: ${esc(u.email)}<br>Depto: ${esc(u.departamento)}</div>`,
        )
        .join("")
    : "No hay usuarios.";
  $("modal").showModal();
});

// ─── RESPUESTAS POR USUARIO ────────────────────────────────
// Reusa /usuarios y /departamentos/{id}/respuestas. Cada usuario pertenece a
// un solo depto, así que sus formularios son los de su depto; filtramos las
// filas de cada hoja por su correo. Cero backend nuevo.

let usuariosCache = [];
let deptoIdPorNombre = {};

async function loadRespUsuario() {
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
}
loadRespUsuario();

on("ruVer", async () => {
  const uid = $("ruUsuario").value;
  if (!uid) return alert("Selecciona un usuario.");
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

// Por cada formulario: filtra TODAS las filas de ese usuario y las muestra en
// tabla, igual que el visor por departamento (pero acotado a un solo correo).
function renderRespUsuario(f, email, abierto) {
  let contenido,
    count = 0;
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
        const thead = `<tr>${f.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
        const tbody = filas
          .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
          .join("");
        contenido = `<div class="resp-scroll"><table class="resp-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`;
      }
    }
  }
  return bloqueForm(f.nombre, count, contenido, abierto);
}
