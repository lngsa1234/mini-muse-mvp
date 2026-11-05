const MUSE_ORIGINS = new Set(["https://mini-muse-project.vercel.app", "http://localhost:3000"]);
let lastTargetTabId = null;

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  if (!isMuseTab(tab)) lastTargetTabId = tabId;
});

chrome.runtime.onMessage.addListener((message, sender) => {
  let origin = sender.origin;
  if (!origin && sender.url) { try { origin = new URL(sender.url).origin; } catch {} }
  if (message?.type !== "mini-muse:browser-request" || !MUSE_ORIGINS.has(origin)) return;
  return dispatch(message.request);
});

async function dispatch(request) {
  if (!lastTargetTabId) throw new Error("Open the website you want Mini Muse to use, then return to Mini Muse.");
  const tab = await chrome.tabs.get(lastTargetTabId);
  if (isMuseTab(tab) || !tab.url || !/^https?:/i.test(tab.url)) throw new Error("Select a normal website tab before using browser tools.");
  const origin = new URL(tab.url).origin + "/*";
  if (!(await chrome.permissions.contains({ origins: [origin] }))) {
    throw new Error("Browser access for this website is not enabled. Open the Mini Muse extension and allow browser control, then retry.");
  }
  await chrome.scripting.executeScript({ target: { tabId: lastTargetTabId }, files: ["target.js"] });
  return chrome.tabs.sendMessage(lastTargetTabId, { type: "mini-muse:tab-request", request });
}

const isMuseTab = tab => {
  try { return MUSE_ORIGINS.has(new URL(tab.url || "").origin); } catch { return false; }
};
