// Google Calendar connector. OAuth tokens are held only by the server in an HttpOnly cookie.
// The tools themselves run in the server agent (server/agent/tools/connectors.js);
// this lists them for the Connectors page.
import { defineConnector } from "../../core/registry.js";

defineConnector({
  key: "calendar", name: "Google Calendar", glyph: "Ca", like: "Google account", desc: "See, add, and remove events on your real primary Google Calendar.",
  scopes: ["See events on your primary Google Calendar", "Add and remove events"],
  manageHtml: () => `<p class="sub">Connected to your Google account. Events are fetched from your primary Google Calendar when Muse uses a calendar tool.</p>`,
  tools: [{ name: "calendar_list", writes: false }, { name: "calendar_add", writes: true }, { name: "calendar_remove", writes: true }]
});
