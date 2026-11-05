window.addEventListener("message", async event => {
  if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== "mini-muse") return;
  try {
    const result = await chrome.runtime.sendMessage({ type: "mini-muse:browser-request", request: event.data.request });
    window.postMessage({ source: "mini-muse-extension", id: event.data.id, result }, window.location.origin);
  } catch (error) {
    window.postMessage({ source: "mini-muse-extension", id: event.data.id, error: error?.message || String(error) }, window.location.origin);
  }
});
