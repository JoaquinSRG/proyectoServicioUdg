import { api, $, val, on, esc, notify, confirmDialog, clear } from "../core.js";

let cachedUsers = [];

export async function loadUserSelects() {
  cachedUsers = await api("/usuarios");
  const placeholder = `<option value="">— selecciona usuario —</option>`;
  const opts = cachedUsers
    .map(
      (u) =>
        `<option value="${u.id}">#${u.id} · ${esc(u.nombre)} — ${esc(u.email)} — ${esc(u.departamento)}</option>`,
    )
    .join("");
  $("ueSelect").innerHTML = placeholder + opts;
  $("uxSelect").innerHTML = placeholder + opts;
}

export function initUsuarios() {
  loadUserSelects();

  on("uCrear", async () => {
    if (!val("uNombre") || !val("uEmail") || !val("uPass"))
      return notify("Nombre, correo y contraseña son obligatorios.", "error");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val("uEmail")))
      return notify("Escribe un correo electrónico válido.", "error");
    const u = await api("/usuarios/registrar", "POST", {
      nombre: val("uNombre"),
      email: val("uEmail"),
      password: val("uPass"),
      id_departamento: +val("uDepto"),
      acces: $("uAcces").value === "1" ? 1 : null,
    });
    clear("uNombre", "uEmail", "uPass", "uAcces");
    await loadUserSelects();
    notify(`Usuario #${u.id} "${u.nombre}" registrado (${u.departamento}).`);
  });

  on("ueGuardar", async () => {
    const id = $("ueSelect").value;
    if (!id) return notify("Selecciona un usuario.", "error");
    const c = {};
    if (val("ueNombre")) c.nombre = val("ueNombre");
    if (val("ueEmail")) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val("ueEmail")))
        return notify("Escribe un correo electrónico válido.", "error");
      c.email = val("ueEmail");
    }
    if (val("uePass")) c.password = val("uePass");
    if ($("ueDepto").value) c.id_departamento = +$("ueDepto").value;
    if ($("ueAcces").value === "1") c.acces = 1;
    else if ($("ueAcces").value === "none") c.acces = null;
    if (!Object.keys(c).length) return notify("No hay cambios para guardar.", "error");
    const res = await api(`/admin/usuarios/${id}`, "PUT", c);
    clear("ueSelect", "ueNombre", "ueEmail", "uePass", "ueDepto", "ueAcces");
    await loadUserSelects();
    notify(res.detail);
  });

  on("uxBorrar", async () => {
    const id = $("uxSelect").value;
    if (!id) return notify("Selecciona un usuario.", "error");
    const nombre = $("uxSelect").options[$("uxSelect").selectedIndex].text;
    if (!(await confirmDialog(`¿Eliminar a "${nombre}"?`, "Eliminar"))) return;
    await api(`/usuarios/${id}`, "DELETE");
    await loadUserSelects();
    notify(`Usuario "${nombre}" eliminado.`);
  });

  on("uConsultar", async () => {
    $("modalTitle").textContent = "Usuarios existentes";
    $("modalBody").innerHTML = cachedUsers.length
      ? cachedUsers
          .map(
            (u) =>
              `<div class="modal-item">ID: ${esc(u.id)}<br>Nombre: ${esc(u.nombre)}<br>Correo: ${esc(u.email)}<br>Depto: ${esc(u.departamento)}</div>`,
          )
          .join("")
      : "No hay usuarios.";
    $("modal").showModal();
  });
}
