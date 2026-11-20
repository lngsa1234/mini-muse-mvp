// Gmail connector. OAuth tokens are held only by the server in an HttpOnly cookie.
// The tools themselves run in the server agent (server/agent/tools/connectors.js);
// this lists them for the Connectors page.
import { defineConnector } from "../../core/registry.js";

defineConnector({
  key: "mail", name: "Gmail", glyph: "M", like: "Google account", desc: "Search and read your real Gmail inbox, and send email after your approval.",
  scopes: ["Search and read your Gmail", "Send Gmail as you (always asks you first)"], lockAsk: true,
  manageHtml: () => `<p class="sub">Connected to your Google account. Gmail content is fetched only when Muse uses a Gmail tool.</p>`,
  tools: [{ name: "mail_search", writes: false }, { name: "mail_read", writes: false }, { name: "mail_send", writes: true }]
});
