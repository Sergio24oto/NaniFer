import { useSyncExternalStore } from "react";
import { emptyState, transition } from "./domain.js";
const KEY = "nanifer.demo.v1";
function read() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return emptyState();
  const s = JSON.parse(raw);
  if (s.version !== 1 || !Array.isArray(s.orders) || !Array.isArray(s.accounts))
    throw Error("Datos locales incompatibles.");
  return s;
}
let state;
try {
  state = read();
} catch {
  state = emptyState();
}
const listeners = new Set();
const channel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(KEY) : null;
function refresh() {
  try {
    state = read();
    listeners.forEach((f) => f());
  } catch {}
}
window.addEventListener("storage", (e) => {
  if (e.key === KEY) refresh();
});
if (channel) channel.onmessage = refresh;
export function useStore() {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => state,
  );
}
export async function dispatch(action) {
  if (!navigator.locks)
    throw Error(
      "Usá una versión actual de Chrome, Edge o Firefox en localhost para sincronizar con seguridad.",
    );
  return navigator.locks.request(KEY, () => {
    const next = transition(
      action.type === "reset" ? emptyState() : read(),
      action,
    );
    localStorage.setItem(KEY, JSON.stringify(next));
    state = next;
    listeners.forEach((f) => f());
    channel?.postMessage("updated");
    return next;
  });
}
