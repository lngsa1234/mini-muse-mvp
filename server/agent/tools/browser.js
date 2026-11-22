// Chrome Browser Bridge tools. These can only run in the user's browser (the
// extension talks to the page), so they are client tools: the server agent asks
// the open tab to run them (runtime.js → client_tool event → /api/agent/answer).
// The approval for browser_click is still asked and checked on the server.
import { S } from "./schema.js";

const relay = async (ctx, name, input) => ctx.clientTool(name, input);

export default {
  id: "browser",
  guidance: "Browser: the optional Mini Muse Browser Bridge controls the last non-Mini-Muse Chrome tab. Use the browser tools only to fill in (and, with approval, submit) one specific application the user has chosen. Never use them to find jobs, identify job boards, research companies, or read a posting: use jobs_search, web_search and web_open for that, which need no extension. To fill a job application, call browser_fields to read the form's structured inputs (labels, selectors, types, dropdown options), then fill them with browser_fill. browser_fill applies values immediately so the user can review them in the page; it does not submit anything. Get the applicant's details from the Library résumé (docs_search) and only fill fields the résumé supports; for a required field the résumé doesn't cover, ask the user instead of guessing. Never fill passwords, one-time codes, SSNs, payment details, or CAPTCHAs — the bridge skips those and the user handles them. After filling, summarise what you entered and ask the user to review the page. browser_click always requires approval, especially the Submit button: only click Submit after the user has reviewed the filled form and approved.",
  tools: [
    { name: "browser_open", client: true, writes: false, description: "Open a public http(s) URL in a new Chrome tab and make it the Browser Bridge target, so you can fill in that application form. Only for an application the user chose to fill in now; to read a posting or search for jobs use web_open, jobs_search or web_search instead. Waits briefly for the page to load before returning.", inputSchema: { type: "object", properties: { url: S }, required: ["url"] },
      run: async ({ url }, ctx, h) => { const out = await relay(ctx, "browser_open", { url: String(url) }); h.act(`opened ${out?.opened || url}`); return out; } },
    { name: "browser_snapshot", client: true, writes: false, description: "Read the title, URL, and visible text from the website tab selected by the Mini Muse Chrome extension.", inputSchema: { type: "object", properties: {} },
      run: async (_input, ctx) => relay(ctx, "browser_snapshot", {}) },
    { name: "browser_fields", client: true, writes: false, description: "Read the structured form fields of the selected Chrome tab: each field's CSS selector, label, type, whether it is required, dropdown options, and current value. Use this before browser_fill to know exactly what to fill and how. Fields marked sensitive (passwords, SSN, payment) are reported but must not be filled.", inputSchema: { type: "object", properties: {} },
      run: async (_input, ctx) => relay(ctx, "browser_fields", {}) },
    { name: "browser_fill", client: true, writes: true, description: "Fill form fields in the selected Chrome tab from the applicant's résumé. Each field needs a CSS selector (from browser_fields) and a value. For checkboxes/radios pass true/false; for dropdowns pass the option value or visible label. Applies immediately so the user can review; it does NOT submit. Sensitive fields are skipped automatically.", inputSchema: { type: "object", properties: { fields: { type: "array", items: { type: "object", properties: { selector: S, value: S }, required: ["selector", "value"] } } }, required: ["fields"] },
      run: async ({ fields }, ctx, h) => {
        const list = Array.isArray(fields) ? fields : [];
        if (!list.length) throw new Error("No fields to fill.");
        const out = await relay(ctx, "browser_fill", { fields: list });
        const filled = out?.filled?.length || 0;
        h.act(`filled ${filled} field${filled === 1 ? "" : "s"}${out?.skipped?.length ? `, skipped ${out.skipped.length} sensitive` : ""}`);
        return out;
      } },
    { name: "browser_click", client: true, writes: true, description: "Click a CSS-selected button or link in the selected Chrome tab. Use only after the user approves; this includes application submission buttons.", inputSchema: { type: "object", properties: { selector: S, description: S }, required: ["selector", "description"] },
      run: async ({ selector, description }, ctx, h) => {
        // A submit click sends something on the user's behalf (e.g. a job application), so its card says so plainly.
        const submits = /submit|apply|send/i.test(String(description) + " " + String(selector));
        const ok = await h.ask("browser_click", submits
          ? { heading: "This will submit the form in your Chrome tab. Did you review every field?", rows: [["Action", String(description)], ["Check first", "Open the tab and confirm the filled answers are right"]], yes: "Submit it", summary: String(description) }
          : { heading: "Muse wants to click a button in your Chrome tab. Allow it?", rows: [["Action", String(description)]], yes: "Click button", summary: String(description) });
        if (ok !== true) return h.refusal(ok);
        return relay(ctx, "browser_click", { selector: String(selector) });
      } }
  ]
};
