import { API, api, $, val, esc, on, requireAuth } from "./core.js";

requireAuth();

on("logout", () => {
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
  const ds = await fetch(API + "/departamentos").then((r) => r.json());
  const opts = ds
    .filter((d) => d.codigo !== "admin") // oculta el depto de privilegios admin
    .map(
      (d) =>
        `<option value="${d.id}">#${d.id} · ${d.nombre} (${d.codigo})</option>`,
    )
    .join("");
  document.querySelectorAll(".depto").forEach((s) => (s.innerHTML = opts));
  $("eDepto").insertAdjacentHTML(
    "afterbegin",
    `<option value="">— no cambiar —</option>`,
  );
}
loadDeptos();

on("fCrear", async () => {
  const f = await api("/formularios", "POST", {
    nombre: val("fNombre"),
    link: val("fLink"),
    id_departamento: +val("fDepto"),
  });
  alert(
    `Éxito: formulario #${f.id} "${f.nombre}" añadido (${f.nombre_departamento}).`,
  );
});

on("fConsultar", async () => {
  const fs = await api("/formularios/mis-formularios");
  $("modalBody").innerHTML = fs.length
    ? fs
        .map(
          (f) =>
            `<div class="modal-item">ID: ${esc(f.id)}<br>Nombre: ${esc(f.nombre)}<br>Link: <a href="${esc(/^https?:\/\//i.test(f.link) ? f.link : "#")}" target="_blank" rel="noopener">${esc(f.link)}</a><br>Depto: ${esc(f.nombre_departamento)}</div>`,
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
