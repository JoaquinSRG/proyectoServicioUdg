import { API } from "./config.js";

// Re-exporto API para que las páginas importen todo desde un solo lugar.
export { API };

// --- DOM ---
export const $ = (id) => document.getElementById(id);
export const val = (id) => $(id).value.trim();
// Vacía los campos indicados por id (p. ej. tras crear un registro con éxito).
export const clear = (...ids) => ids.forEach((id) => ($(id).value = ""));
export const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

// Devuelve la URL solo si es http(s); si no, "#". Evita que un enlace
// peligroso (p. ej. "javascript:...") guardado en la BD se vuelva clickeable.
export const safeUrl = (u) =>
  /^https?:\/\//i.test(String(u)) ? String(u) : "#";

// --- Sesión ---
export const token = () => localStorage.getItem("token");

// Llama esto al inicio de cada página protegida.
export function requireAuth() {
  if (!token()) location.href = "index.html";
}

// --- Fetch con token + manejo de errores en un solo lugar ---
export async function api(path, method = "GET", body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(token() && { Authorization: `Bearer ${token()}` }),
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body && JSON.stringify(body),
  });
  // Mejora añadida: si el token venció, de vuelta al login.
  if (res.status === 401) {
    localStorage.clear();
    location.href = "index.html";
    return;
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // FastAPI manda 'detail' como string (errores normales) o como array de
    // objetos {loc, msg, ...} en errores de validación 422. Cubrimos ambos
    // para no terminar mostrando "[object Object]" al usuario.
    const d = data.detail;
    const msg = Array.isArray(d)
      ? d.map((e) => e.msg).join(", ")
      : d || "Error";
    throw new Error(msg);
  }
  return data;
}

// --- Descarga de archivos (Excel/PDF) ---
// A diferencia de api(), la respuesta no es JSON sino un archivo binario
// (StreamingResponse en el backend), así que se maneja como blob y se
// dispara la descarga en el navegador mediante un <a> temporal.
export async function downloadFile(path, body, fallbackName) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: {
      ...(token() && { Authorization: `Bearer ${token()}` }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    localStorage.clear();
    location.href = "index.html";
    return;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const d = data.detail;
    const msg = Array.isArray(d) ? d.map((e) => e.msg).join(", ") : d || "Error al generar el archivo.";
    throw new Error(msg);
  }
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- Feedback en pantalla (reemplazan a alert/confirm del navegador) ---

// "Toast" flotante que aparece y se va solo. tipo: "ok" (verde) | "error" (rojo).
// Crea su contenedor la primera vez, así no hace falta tocar el HTML.
export function notify(msg, tipo = "ok") {
  let cont = document.querySelector(".toast-container");
  if (!cont) {
    cont = document.createElement("div");
    cont.className = "toast-container";
    document.body.appendChild(cont);
  }
  const t = document.createElement("div");
  t.className = `toast toast-${tipo}`;
  t.textContent = msg;
  cont.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show")); // dispara el fade-in
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 300); // espera el fade-out antes de quitarlo
  }, 3500);
}

// Confirmación con <dialog> nativo. Devuelve una promesa true/false, así que
// el llamador hace `if (!(await confirmDialog(...))) return;`.
export function confirmDialog(msg, okLabel = "Aceptar") {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "confirm-dialog";
    dlg.innerHTML =
      `<p class="confirm-msg"></p>` +
      `<div class="confirm-actions">` +
      `<button type="button" class="confirm-cancel">Cancelar</button>` +
      `<button type="button" class="confirm-ok"></button>` +
      `</div>`;
    // textContent (no innerHTML) para que el mensaje/label no inyecten HTML.
    dlg.querySelector(".confirm-msg").textContent = msg;
    dlg.querySelector(".confirm-ok").textContent = okLabel;
    document.body.appendChild(dlg);
    const cerrar = (valor) => {
      dlg.close();
      dlg.remove();
      resolve(valor);
    };
    dlg.querySelector(".confirm-cancel").onclick = () => cerrar(false);
    dlg.querySelector(".confirm-ok").onclick = () => cerrar(true);
    dlg.addEventListener("cancel", () => cerrar(false)); // tecla Esc
    dlg.showModal();
  });
}

// Asigna onclick, deshabilita el botón mientras corre (evita doble envío y
// registros duplicados) y atrapa errores, todo en un solo lugar.
export const on = (id, fn) => {
  const el = $(id);
  el.onclick = async () => {
    el.disabled = true;
    try {
      await fn();
    } catch (e) {
      notify(e.message, "error");
    } finally {
      el.disabled = false;
    }
  };
};
