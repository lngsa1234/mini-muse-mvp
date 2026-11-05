const grant = document.querySelector("#grant"), state = document.querySelector("#state");
async function render() {
  const enabled = await chrome.permissions.contains({ origins: ["<all_urls>"] });
  grant.textContent = enabled ? "Browser control enabled" : "Enable browser control";
  grant.disabled = enabled; state.textContent = enabled ? "You can revoke access anytime in Chrome extension settings." : "Chrome will ask you to approve website access.";
}
grant.addEventListener("click", async () => { await chrome.permissions.request({ origins: ["<all_urls>"] }); render(); });
render();
