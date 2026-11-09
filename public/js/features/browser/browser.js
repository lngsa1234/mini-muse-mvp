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
  guidance: "Browser: the optional Mini Muse Browser Bridge controls the last non-Mini-Muse Chrome tab. To fill a job application, call browser_fields to read the form's structured inputs (labels, selectors, types, dropdown options), then fill them with browser_fill. browser_fill applies values immediately so the user can review them in the page; it does not submit anything. Get the applicant's details from the Library résumé (docs_search) and only fill fields the résumé supports; for a required field the résumé doesn't cover, ask the user instead of guessing. Never fill passwords, one-time codes, SSNs, payment details, or CAPTCHAs — the bridge skips those and the user handles them. After filling, summarise what you entered and ask the user to review the page. browser_click always requires approval, especially the Submit button: only click Submit after the user has reviewed the filled form and approved.",
  tools: [
    { name: "browser_open", writes: false, description: "Open a public http(s) URL in a new Chrome tab and make it the Browser Bridge target. Use after web_search selects a job-posting URL, or to open a specific posting's link from a search/listing page. Waits briefly for the page to load before returning.", inputSchema: { type: "object", properties: { url: S }, required: ["url"] }, run: async ({ url }, _ctx, h) => { const out = await request({ type: "open", url: String(url) }); await new Promise(resolve => setTimeout(resolve, 2000)); h.act(`opened ${out.opened}`); return out; } },
    { name: "browser_snapshot", writes: false, description: "Read the title, URL, and visible text from the website tab selected by the Mini Muse Chrome extension.", inputSchema: { type: "object", properties: {} }, run: async () => request({ type: "snapshot" }) },
    { name: "browser_fields", writes: false, description: "Read the structured form fields of the selected Chrome tab: each field's CSS selector, label, type, whether it is required, dropdown options, and current value. Use this before browser_fill to know exactly what to fill and how. Fields marked sensitive (passwords, SSN, payment) are reported but must not be filled.", inputSchema: { type: "object", properties: {} }, run: async () => request({ type: "fields" }) },
    { name: "browser_fill", writes: true, description: "Fill form fields in the selected Chrome tab from the applicant's résumé. Each field needs a CSS selector (from browser_fields) and a value. For checkboxes/radios pass true/false; for dropdowns pass the option value or visible label. Applies immediately so the user can review; it does NOT submit. Sensitive fields are skipped automatically.", inputSchema: { type: "object", properties: { fields: { type: "array", items: { type: "object", properties: { selector: S, value: S }, required: ["selector", "value"] } } }, required: ["fields"] }, run: async ({ fields }, _ctx, h) => {
      const list = Array.isArray(fields) ? fields : [];
      if (!list.length) throw new Error("No fields to fill.");
      const out = await request({ type: "fill", fields: list });
      const filled = out?.filled?.length || 0;
      h.act(`filled ${filled} field${filled === 1 ? "" : "s"}${out?.skipped?.length ? `, skipped ${out.skipped.length} sensitive` : ""}`);
      return out;
    } },
    { name: "browser_click", writes: true, description: "Click a CSS-selected button or link in the selected Chrome tab. Use only after the user approves; this includes application submission buttons.", inputSchema: { type: "object", properties: { selector: S, description: S }, required: ["selector", "description"] }, run: async ({ selector, description }, context, h) => {
      const ok = await h.ask("browser_click", { heading: "Muse wants to click a button in your Chrome tab. Allow it?", rows: [["Action", String(description)]], yes: "Click button", summary: String(description) }, context);
      if (ok !== true) return h.refusal(ok);
      return request({ type: "click", selector: String(selector) });
    } }
  ]
});
