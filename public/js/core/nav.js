// Page navigation: sidebar (data-go) and narrow-screen tabs (data-tab).
import { $ } from "./dom.js";
import { features, onClick } from "./registry.js";

export const MAINS = ["chat", "ideas", "goals", "library", "connectors", "settings"];

export function go(view) {
  if (MAINS.includes(view)) {
    $("main").dataset.main = view; $("panes").dataset.mobile = "main";
    document.querySelectorAll(".nav button").forEach(b => { if (b.dataset.go === view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  } else $("panes").dataset.mobile = view;
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === view));
}

// Navigating to a page also gives its feature a chance to refresh (onShow).
function navigate(view) { go(view); features.find(f => f.id === view)?.onShow?.(); }
onClick("go", navigate);
onClick("tab", navigate);
