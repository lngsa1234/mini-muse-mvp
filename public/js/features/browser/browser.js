// Chrome extension bridge. The server agent can't reach the extension, so it
// asks this page to run the browser_* tools (server/agent/tools/browser.js
// defines them and asks for approvals; agent/run.js calls runBrowserTool on a
// client_tool event). The extension is optional.

const request = (request) => new Promise((resolve, reject) => {
  const id = crypto.randomUUID();
  const timer = setTimeout(() => { cleanup(); reject(new Error("Mini Muse Browser Bridge did not respond: the Chrome extension isn't installed or enabled. Don't retry browser tools this turn. To read a page use web_open; to find openings use jobs_search or web_search. Only filling in an application form needs the extension.")); }, 12_000);
  const receive = event => {
    if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== "mini-muse-extension" || event.data.id !== id) return;
    cleanup(); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.result);
  };
  const cleanup = () => { clearTimeout(timer); window.removeEventListener("message", receive); };
  window.addEventListener("message", receive);
  window.postMessage({ source: "mini-muse", id, request }, window.location.origin);
});

const RUN = {
  // Waits briefly for the page to load before returning.
  browser_open: async ({ url }) => { const out = await request({ type: "open", url: String(url) }); await new Promise(r => setTimeout(r, 2000)); return out; },
  browser_snapshot: () => request({ type: "snapshot" }),
  browser_fields: () => request({ type: "fields" }),
  browser_fill: ({ fields }) => request({ type: "fill", fields: Array.isArray(fields) ? fields : [] }),
  // The server only sends this after the user approved the click.
  browser_click: ({ selector }) => request({ type: "click", selector: String(selector) })
};

export async function runBrowserTool(name, input) {
  const fn = RUN[name];
  if (!fn) throw new Error("This page can't run " + name);
  return fn(input || {});
}
