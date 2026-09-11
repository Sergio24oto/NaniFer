import { useSyncExternalStore } from "react";
import { operationId } from "./domain.js";
const blank = { accounts: [], orders: [], payments: [], staff: [], reservations: [], calls: [], calendarToday: null };
let state = {
  ...blank,
  catalog: { products: [], categories: [], flavors: [] },
  user: null,
  csrf: "",
  connected: null,
  loading: true,
  error: "",
  mode: "public",
  table: null,
};
const listeners = new Set();
function update(patch) {
  state = { ...state, ...patch };
  listeners.forEach((f) => f());
}
export function useStore() {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => state,
  );
}
export async function request(
  path,
  { method = "GET", body, key, asBlob = false, device } = {},
) {
  let response;
  try {
    response = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "NaniFer",
        "X-CSRF-Token": state.csrf,
        ...(key ? { "Idempotency-Key": key } : {}),
        ...(device ? {'X-Public-Device':device} : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    update({ connected: false });
    const e = new Error(
      "Sin conexión. No se pudo confirmar la operación. Reintentá cuando vuelva el servicio.",
    );
    e.uncertain = true;
    throw e;
  }
  if (response.ok && asBlob) return response.blob();
  let data;
  try {
    data = await response.json();
  } catch {
    update({ connected: false });
    const error = new Error(
      "No se pudo interpretar la respuesta del servidor. Reintentá la misma operación.",
    );
    error.uncertain = true;
    throw error;
  }
  if (!response.ok) {
    const e = new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Revisá los datos del formulario.",
    );
    e.status = response.status;
    e.uncertain = response.status >= 500;
    if (e.uncertain) update({ connected: false });
    if (response.status === 401) update({ user: null, csrf: "", ...blank });
    throw e;
  }
  return data;
}
let revision = 0;
export async function refresh() {
  const rev = ++revision;
  const { mode, table } = state;
  try {
    let catalog = {products: [], categories: [], flavors: []};
    if (mode === "public" && table) catalog = await request("/public/menu/" + table);
    let auth = { user: state.user, csrf: state.csrf };
    let data = blank;
    if (mode === "staff") {
      try {
        auth = await request("/auth/me");
        catalog = await request("/catalog");
        data = await request("/state");
      } catch (e) {
        if (e.status !== 401) throw e;
        auth = { user: null, csrf: "" };
        catalog = {products: [], categories: [], flavors: []};
        data = blank;
      }
    }
    if (rev === revision)
      update({
        ...data,
        ...auth,
        catalog,
        connected: true,
        loading: false,
        error: "",
      });
  } catch (e) {
    if (rev === revision)
      update({ connected: false, loading: false, error: e.message });
  }
}
export function configure(mode, table) {
  revision++;
  update({ ...blank, mode, table, loading: true, error: "" });
  void refresh();
}
setInterval(() => void refresh(), 4000);
window.addEventListener("online", () => void refresh());
window.addEventListener("offline", () => update({ connected: false }));
window.addEventListener("focus", () => void refresh());
export async function login(username, password) {
  const auth = await request("/auth/login", {
    method: "POST",
    body: { username, password },
  });
  update(auth);
  await refresh();
}
export async function logout() {
  await request("/auth/logout", { method: "POST" });
  update({ ...blank, user: null, csrf: "" });
}
export async function mutate(path, body, method = "POST") {
  const result = await request(path, { method, body });
  await refresh();
  return result;
}
// Keep the exact payload/key after an uncertain response, including across reloads.
export function pendingOperation(scope) {
  try {
    return JSON.parse(sessionStorage.getItem("nf.pending." + scope) || "null");
  } catch {
    return null;
  }
}
export async function submitOnce(scope, path, body) {
  let pending = pendingOperation(scope);
  if (!pending) {
    pending = { key: operationId(), path, body };
    sessionStorage.setItem("nf.pending." + scope, JSON.stringify(pending));
  }
  try {
    const result = await request(pending.path, {
      method: "POST",
      body: pending.body,
      key: pending.key,
    });
    sessionStorage.removeItem("nf.pending." + scope);
    await refresh();
    return result;
  } catch (e) {
    if (!e.uncertain) sessionStorage.removeItem("nf.pending." + scope);
    throw e;
  }
}
