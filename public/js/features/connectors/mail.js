// Mail connector (sample inbox). Sending always needs approval and is simulated.
import { esc } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { defineConnector, onClick, renderMine } from "../../core/registry.js";
import { save } from "../../core/storage.js";
import { audit } from "../../core/activity.js";
import { S } from "../../core/schema.js";
import { toks } from "../../core/format.js";
import { ago } from "./sample-data.js";

function seed() {
  state.inbox = [
    { id: "m1", from: "Maya Chen <maya@example.com>", subject: "Venue for next Wednesday?", date: ago(0, 9), unread: true, example: true,
      body: "Hi! Is the meetup still at the library? I can bring snacks. Also, could we start at 7:30 instead of 7? I have a class that ends at 7." },
    { id: "m2", from: "Library Room Desk <rooms@example.com>", subject: "Room B booking confirmed", date: ago(1, 14), unread: true, example: true,
      body: "Your booking for Room B is confirmed for next Wednesday, 6:30 to 9:00 PM. Please return the key to the front desk when you leave." },
    { id: "m3", from: "Sam Ortiz <sam@example.com>", subject: "Re: agent circle", date: ago(2, 18), unread: false, example: true,
      body: "Count me in for the next session. Could someone share the slides from last time? I missed the part about tool descriptions." },
    { id: "m4", from: "AI Weekly <news@example.com>", subject: "This week: personal agents arrive", date: ago(3, 7), unread: false, example: true,
      body: "Personal agents that act for you are arriving in consumer apps. Also inside: five tips for writing tool descriptions models understand." }
  ];
}

function manageHtml() {
  const unread = state.inbox.filter(m => m.unread).length;
  return `<div class="sub">Inbox: ${state.inbox.length} sample messages · ${unread} unread</div>
    <ul class="plain">${state.inbox.slice(0, 6).map(m => `<li class="item"><details class="mail grow"><summary><strong>${esc(m.subject)}</strong>${m.unread ? " ·  <span class='sub'>unread</span>" : ""}<br><span class="sub">${esc(m.from)}</span></summary><pre>${esc(m.body)}</pre></details></li>`).join("")}</ul>
    <div><button class="btn small" data-reset-inbox>Reload sample inbox</button></div>
    <div class="sub" style="margin-top:6px">Sent by Muse: ${state.outbox.length}</div>
    <ul class="plain">${[...state.outbox].reverse().map(o => `<li class="item"><details class="mail grow"><summary><strong>${esc(o.subject)}</strong><br><span class="sub">to ${esc(o.to)} · ${o.status}</span></summary><pre>${esc(o.body)}</pre></details></li>`).join("") || `<li><p class="empty">Emails you approve land here. Nothing is really sent.</p></li>`}</ul>`;
}

onClick("resetInbox", () => { seed(); audit("mail_reset", "inbox", "Sample inbox reloaded", "you"); renderMine(); save(); });

defineConnector({
  key: "mail", name: "Mail", glyph: "M", like: "Works like Gmail", desc: "Muse can search and read your inbox and send email for you.",
  scopes: ["Search and read your inbox", "Send email as you (always asks you first)"], lockAsk: true,
  seed, manageHtml,
  tools: [
    { name: "mail_search", writes: false, description: "Mail connector. Search the user's inbox by keyword (sender, subject or text); empty query lists the newest. Returns up to 8 messages with id, from, subject, date, unread and a short preview.",
      inputSchema: { type: "object", properties: { query: S } },
      run: ({ query }, _ctx, h) => {
        const q = toks(query || "");
        const hits = state.inbox.filter(m => !q.length || q.some(w => (m.from + " " + m.subject + " " + m.body).toLowerCase().includes(w)))
          .sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
        h.act(`${query ? "“" + query + "”" : "newest"} → ${hits.length} found`);
        return hits.map(m => ({ id: m.id, from: m.from, subject: m.subject, date: m.date, unread: m.unread, preview: m.body.slice(0, 90) }));
      } },
    { name: "mail_read", writes: false, description: "Mail connector. Read one email in full by id. Marks it read.",
      inputSchema: { type: "object", properties: { id: S }, required: ["id"] },
      run: ({ id }, _ctx, h) => {
        const m = state.inbox.find(x => x.id === String(id)); if (!m) throw new Error("no email " + id);
        m.unread = false; h.act(m.subject);
        return { from: m.from, subject: m.subject, date: m.date, body: m.body };
      } },
    { name: "mail_send", writes: true, description: "Mail connector. Send an email (or a reply) as the user. The user must approve first. Returns whether it was sent.",
      inputSchema: { type: "object", properties: { to: S, subject: S, body: S }, required: ["to", "subject", "body"] },
      run: async (input, context, h) => {
        const data = { to: String(input.to || ""), subject: String(input.subject || ""), body: String(input.body || "") };
        const ok = await h.ask("mail_send", { heading: "Muse wants to send this email. Allow it?", rows: [["To", data.to], ["Subject", data.subject]], body: data.body, yes: "Send email", summary: `“${data.subject}” to ${data.to}` }, context);
        if (ok !== true) return h.refusal(ok);
        state.outbox.push({ ...data, status: "sent (simulated)", t: Date.now() });
        return "Sent (simulated; it's in Sent mail).";
      } }
  ]
});
