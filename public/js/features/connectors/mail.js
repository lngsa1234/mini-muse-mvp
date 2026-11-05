// Gmail connector. OAuth tokens are held only by the server in an HttpOnly cookie.
import { defineConnector } from "../../core/registry.js";
import { S } from "../../core/schema.js";
import * as api from "../../core/api.js";

defineConnector({
  key: "mail", name: "Gmail", glyph: "M", like: "Google account", desc: "Search and read your real Gmail inbox, and send email after your approval.",
  scopes: ["Search and read your Gmail", "Send Gmail as you (always asks you first)"], lockAsk: true,
  manageHtml: () => `<p class="sub">Connected to your Google account. Gmail content is fetched only when Muse uses a Gmail tool.</p>`,
  tools: [
    { name: "mail_search", writes: false, description: "Gmail connector. Search the user's real Gmail inbox by Gmail search query; empty query lists newest messages.", inputSchema: { type: "object", properties: { query: S } }, run: async ({ query }, _ctx, h) => { const out = await api.googleMailSearch(query || ""); h.act(`${out.messages.length} Gmail messages`); return out.messages; } },
    { name: "mail_read", writes: false, description: "Gmail connector. Read one Gmail message in full by id.", inputSchema: { type: "object", properties: { id: S }, required: ["id"] }, run: async ({ id }, _ctx, h) => { const out = await api.googleMailRead(id); h.act(out.subject || "Gmail message"); return out; } },
    { name: "mail_send", writes: true, description: "Gmail connector. Send an email as the user. The user must approve first.", inputSchema: { type: "object", properties: { to: S, subject: S, body: S }, required: ["to", "subject", "body"] }, run: async (input, context, h) => { const ok = await h.ask("mail_send", { heading: "Muse wants to send this Gmail message. Allow it?", rows: [["To", String(input.to)], ["Subject", String(input.subject)]], body: String(input.body), yes: "Send email", summary: `“${input.subject}” to ${input.to}` }, context); if (ok !== true) return h.refusal(ok); const out = await api.googleMailSend(input); return `Sent Gmail message (${out.id}).`; } }
  ]
});
