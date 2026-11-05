// Chrome extension bridge. The extension is optional; these tools explain how
// to install it when the browser bridge is unavailable.
import { defineFeature } from "../../core/registry.js";
import { S } from "../../core/schema.js";

const request = (request) => new Promise((resolve, reject) => {
  const id = crypto.randomUUID();
  const timer = setTimeout(() => { cleanup(); reject(new Error("Mini Muse Browser Bridge did not respond. Install and enable the Chrome extension, then retry.")); }, 12_000);
  const receive = event => {
    if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== "mini-muse-extension" || event.data.id !== id) return;
    cleanup(); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.result);
  };
  const cleanup = () => { clearTimeout(timer); window.removeEventListener("message", receive); };
  window.addEventListener("message", receive);
  window.postMessage({ source: "mini-muse", id, request }, window.location.origin);
});

defineFeature({
  id: "browser",
  guidance: "Browser: the optional Mini Muse Browser Bridge controls the last non-Mini-Muse Chrome tab. Use browser_snapshot to read a page. Before browser_fill or browser_click, explain what will change and request approval. Never ask for or handle passwords, one-time codes, payment details, or CAPTCHAs. browser_click always requires approval, especially before submitting a form.",
  tools: [
    { name: "browser_snapshot", writes: false, description: "Read the title, URL, and visible text from the website tab selected by the Mini Muse Chrome extension.", inputSchema: { type: "object", properties: {} }, run: async () => request({ type: "snapshot" }) },
    { name: "browser_fill", writes: true, description: "Fill specified form fields in the selected Chrome tab. Each field needs a CSS selector and text value. Always requires user approval.", inputSchema: { type: "object", properties: { fields: { type: "array", items: { type: "object", properties: { selector: S, value: S }, required: ["selector", "value"] } } }, required: ["fields"] }, run: async ({ fields }, context, h) => {
      const list = Array.isArray(fields) ? fields : [];
      const ok = await h.ask("browser_fill", { heading: "Muse wants to fill fields in your Chrome tab. Allow it?", rows: list.slice(0, 5).map(field => [String(field.selector), String(field.value)]), yes: "Fill fields", summary: `${list.length} browser form field${list.length === 1 ? "" : "s"}` }, context);
      if (ok !== true) return h.refusal(ok);
      return request({ type: "fill", fields: list });
    } },
    { name: "browser_click", writes: true, description: "Click a CSS-selected button or link in the selected Chrome tab. Use only after the user approves; this includes application submission buttons.", inputSchema: { type: "object", properties: { selector: S, description: S }, required: ["selector", "description"] }, run: async ({ selector, description }, context, h) => {
      const ok = await h.ask("browser_click", { heading: "Muse wants to click a button in your Chrome tab. Allow it?", rows: [["Action", String(description)]], yes: "Click button", summary: String(description) }, context);
      if (ok !== true) return h.refusal(ok);
      return request({ type: "click", selector: String(selector) });
    } }
  ]
});
