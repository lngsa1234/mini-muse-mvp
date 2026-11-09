// background.js re-injects this file before each request. Drop any listener
// from a previous injection (e.g. after an extension reload the old one's
// context is dead) and register a fresh one, so there is always exactly one.
if (globalThis.__miniMuseTargetListener) {
  try { chrome.runtime.onMessage.removeListener(globalThis.__miniMuseTargetListener); } catch (e) {}
}
globalThis.__miniMuseTargetListener = message => {
  if (message?.type !== "mini-muse:tab-request") return;
  const { request } = message;
  if (request.type === "snapshot") return snapshot();
  if (request.type === "fields") return fields();
  if (request.type === "fill") return fill(request.fields);
  if (request.type === "click") return click(request.selector);
  throw new Error("Unsupported browser action.");
};
chrome.runtime.onMessage.addListener(globalThis.__miniMuseTargetListener);

function snapshot() {
  return { title: document.title, url: location.href, text: document.body?.innerText?.slice(0, 12000) || "" };
}

// Password/credential-type fields are never auto-filled; the user handles them.
const SENSITIVE = /password|passwd|ssn|social.?security|card.?number|cvv|cvc|routing|account.?number/i;
const isSensitive = el => (el.type || "").toLowerCase() === "password" || SENSITIVE.test(`${el.name} ${el.id} ${el.getAttribute("autocomplete") || ""}`);
const quote = v => String(v).replace(/"/g, '\\"');
const cssEscape = v => (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/[^a-zA-Z0-9_-]/g, "\\$&");

// A selector that uniquely matches `el`: prefer #id, then [name=...], else an nth-of-type path.
function uniqueSelector(el) {
  if (el.id && document.querySelectorAll(`#${cssEscape(el.id)}`).length === 1) return `#${cssEscape(el.id)}`;
  const name = el.getAttribute("name");
  if (name) { const sel = `${el.tagName.toLowerCase()}[name="${quote(name)}"]`; if (document.querySelectorAll(sel).length === 1) return sel; }
  const parts = [];
  for (let node = el; node && node.nodeType === 1 && node.tagName.toLowerCase() !== "html"; node = node.parentElement) {
    if (node.id) { parts.unshift(`#${cssEscape(node.id)}`); break; }
    const siblings = node.parentElement ? [...node.parentElement.children].filter(c => c.tagName === node.tagName) : [];
    parts.unshift(siblings.length > 1 ? `${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})` : node.tagName.toLowerCase());
  }
  return parts.join(" > ");
}

// Human-readable label for a field, used by the model to map résumé data to inputs.
function labelFor(el) {
  if (el.labels && el.labels.length) return el.labels[0].innerText.trim();
  const ariaId = el.getAttribute("aria-labelledby");
  if (ariaId) { const l = document.getElementById(ariaId); if (l) return l.innerText.trim(); }
  return (el.getAttribute("aria-label") || el.placeholder || el.name || "").trim();
}

// Structured description of every editable field on the page (for reliable auto-fill).
function fields() {
  const skip = new Set(["hidden", "submit", "button", "image", "reset"]);
  const out = [];
  for (const el of document.querySelectorAll("input, textarea, select")) {
    const type = (el.getAttribute("type") || el.tagName).toLowerCase();
    if (skip.has(type)) continue;
    const field = { selector: uniqueSelector(el), label: labelFor(el), type, required: !!el.required };
    if (isSensitive(el)) { field.sensitive = true; out.push(field); continue; }
    if (el.tagName.toLowerCase() === "select") field.options = [...el.options].map(o => ({ value: o.value, label: o.text.trim() })).slice(0, 50);
    else if (type === "checkbox" || type === "radio") field.checked = el.checked;
    else if (type === "file") field.note = "file upload — the user must attach this manually";
    else field.value = typeof el.value === "string" ? el.value.slice(0, 120) : "";
    out.push(field);
  }
  return { title: document.title, url: location.href, fields: out.slice(0, 80) };
}

function fill(fields) {
  if (!Array.isArray(fields) || !fields.length) throw new Error("No form fields were provided.");
  const filled = [], skipped = [];
  for (const field of fields) {
    const el = document.querySelector(String(field.selector || ""));
    if (!el) throw new Error(`No field matches ${field.selector}`);
    if (isSensitive(el)) { skipped.push(String(field.selector)); continue; }
    const type = (el.getAttribute("type") || el.tagName).toLowerCase();
    if (type === "checkbox" || type === "radio") {
      el.checked = field.value === true || /^(true|yes|on|1|checked)$/i.test(String(field.value ?? ""));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (el.tagName.toLowerCase() === "select") {
      const want = String(field.value ?? "");
      const opt = [...el.options].find(o => o.value === want || o.text.trim().toLowerCase() === want.toLowerCase());
      el.value = opt ? opt.value : want;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      if (!("value" in el)) throw new Error(`No editable field matches ${field.selector}`);
      el.focus(); el.value = String(field.value ?? "");
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(field.value ?? "") }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    filled.push(String(field.selector));
  }
  return { filled, skipped, url: location.href };
}
function click(selector) {
  const element = document.querySelector(String(selector || ""));
  if (!element) throw new Error(`No element matches ${selector}`);
  element.click(); return { clicked: String(selector), url: location.href };
}
