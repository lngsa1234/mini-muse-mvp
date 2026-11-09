const RECONNECT = "The Browser Bridge lost its link to the extension — this happens after the extension is reloaded or updated. Reload this Mini Muse tab to reconnect, then try again.";

window.addEventListener("message", async event => {
  if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== "mini-muse") return;
  const reply = payload => window.postMessage({ source: "mini-muse-extension", id: event.data.id, ...payload }, window.location.origin);
  try {
    // When the extension reloads, this already-loaded content script keeps
    // running but its chrome.runtime connection is gone (runtime.id is undefined).
    if (!chrome.runtime?.id) return reply({ error: RECONNECT });
    reply({ result: await chrome.runtime.sendMessage({ type: "mini-muse:browser-request", request: event.data.request }) });
  } catch (error) {
    const message = error?.message || String(error);
    reply({ error: /context invalidated|Extension context|receiving end does not exist/i.test(message) ? RECONNECT : message });
  }
});
