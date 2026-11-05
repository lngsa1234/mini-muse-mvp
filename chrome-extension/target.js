if (!globalThis.__miniMuseTargetInstalled) {
  globalThis.__miniMuseTargetInstalled = true;
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type !== "mini-muse:tab-request") return;
    const { request } = message;
    if (request.type === "snapshot") return snapshot();
    if (request.type === "fill") return fill(request.fields);
    if (request.type === "click") return click(request.selector);
    throw new Error("Unsupported browser action.");
  });
}

function snapshot() {
  return { title: document.title, url: location.href, text: document.body?.innerText?.slice(0, 12000) || "" };
}
function fill(fields) {
  if (!Array.isArray(fields) || !fields.length) throw new Error("No form fields were provided.");
  const changed = [];
  for (const field of fields) {
    const element = document.querySelector(String(field.selector || ""));
    if (!element || !("value" in element)) throw new Error(`No editable field matches ${field.selector}`);
    element.focus(); element.value = String(field.value ?? "");
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(field.value ?? "") }));
    element.dispatchEvent(new Event("change", { bubbles: true })); changed.push(String(field.selector));
  }
  return { filled: changed, url: location.href };
}
function click(selector) {
  const element = document.querySelector(String(selector || ""));
  if (!element) throw new Error(`No element matches ${selector}`);
  element.click(); return { clicked: String(selector), url: location.href };
}
