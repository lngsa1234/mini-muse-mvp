// Connectors: Gmail, Google Calendar (server/google.js; OAuth tokens stay in the
// HttpOnly cookie of the request that started the turn) and Contacts (user_state).
// A connector's tools are offered only while it is connected.
import { randomBytes } from "node:crypto";
import { S } from "./schema.js";

const rid = () => randomBytes(4).toString("hex");
const fmtWhen = (iso, tz) => { const d = new Date(iso); if (isNaN(d)) return String(iso); try { return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz || undefined }); } catch (_) { return d.toISOString(); } };

// Name, permission behaviour and the user-facing label of each connector.
export const CONNECTORS = {
  mail: { name: "Gmail", lockAsk: true },
  calendar: { name: "Google Calendar" },
  contacts: { name: "Contacts" }
};

export const isOn = (ctx, k) => k === "mail" || k === "calendar" ? !!ctx.googleConnected : !!ctx.data.connectors?.[k]?.on;
export const needsAsk = (ctx, k) => !!CONNECTORS[k].lockAsk || (ctx.data.connectors?.[k]?.writes || "ask") === "ask";

const mail = [
  { name: "mail_search", connector: "mail", writes: false, description: "Gmail connector. Search the user's real Gmail inbox by Gmail search query; empty query lists newest messages.", inputSchema: { type: "object", properties: { query: S } },
    run: async ({ query }, ctx, h) => { const out = await ctx.services.google("mail/search", { query: query || "" }); h.act(`${out.messages.length} Gmail messages`); return out.messages; } },
  { name: "mail_read", connector: "mail", writes: false, description: "Gmail connector. Read one Gmail message in full by id.", inputSchema: { type: "object", properties: { id: S }, required: ["id"] },
    run: async ({ id }, ctx, h) => { const out = await ctx.services.google("mail/read", { id }); h.act(out.subject || "Gmail message"); return out; } },
  { name: "mail_send", connector: "mail", writes: true, description: "Gmail connector. Send an email as the user. The user must approve first.", inputSchema: { type: "object", properties: { to: S, subject: S, body: S }, required: ["to", "subject", "body"] },
    run: async (input, ctx, h) => {
      const ok = await h.ask("mail_send", { heading: "Muse wants to send this Gmail message. Allow it?", rows: [["To", String(input.to)], ["Subject", String(input.subject)]], body: String(input.body), yes: "Send email", summary: `“${input.subject}” to ${input.to}` });
      if (ok !== true) return h.refusal(ok);
      const out = await ctx.services.google("mail/send", input); return `Sent Gmail message (${out.id}).`;
    } }
];

const calendar = [
  { name: "calendar_list", connector: "calendar", writes: false, description: "Google Calendar connector. List primary-calendar events, optionally on or after from_date (YYYY-MM-DD).", inputSchema: { type: "object", properties: { from_date: S } },
    run: async ({ from_date }, ctx, h) => { const out = await ctx.services.google("calendar/list", { from_date: from_date || "" }); h.act(`${out.events.length} calendar events`); return out.events; } },
  { name: "calendar_add", connector: "calendar", writes: true, description: "Google Calendar connector. Add an event to the user's primary calendar. start and end are ISO times.", inputSchema: { type: "object", properties: { title: S, start: S, end: S, notes: S }, required: ["title", "start"] },
    run: async (input, ctx, h) => {
      const when = fmtWhen(input.start, ctx.tz);
      if (h.needsAsk("calendar")) {
        const ok = await h.ask("calendar_add", { heading: "Muse wants to add this to Google Calendar. Allow it?", rows: [["Event", String(input.title)], ["When", when]], body: input.notes ? String(input.notes) : "", yes: "Add event", summary: `${input.title} · ${when}` });
        if (ok !== true) return h.refusal(ok);
      }
      const out = await ctx.services.google("calendar/add", { ...input, timeZone: ctx.tz });
      h.act(`${input.title} · ${when}`); return out;
    } },
  { name: "calendar_remove", connector: "calendar", writes: true, description: "Google Calendar connector. Remove an event from the user's primary calendar by event_id.", inputSchema: { type: "object", properties: { event_id: S }, required: ["event_id"] },
    run: async ({ event_id }, ctx, h) => {
      if (h.needsAsk("calendar")) {
        const ok = await h.ask("calendar_remove", { heading: "Muse wants to remove this Google Calendar event. Allow it?", rows: [["Event ID", String(event_id)]], yes: "Remove event", summary: `remove event ${event_id}` });
        if (ok !== true) return h.refusal(ok);
      }
      const out = await ctx.services.google("calendar/remove", { event_id }); h.act(`removed calendar event ${event_id}`); return out;
    } }
];

const contacts = [
  { name: "contacts_lookup", connector: "contacts", writes: false, description: "Contacts connector. Find people by name or email. Returns name, email and note.",
    inputSchema: { type: "object", properties: { name: S }, required: ["name"] },
    run: async ({ name }, ctx, h) => {
      const q = String(name || "").toLowerCase().trim();
      const hits = (ctx.data.contacts || []).filter(c => (c.name + " " + c.email).toLowerCase().includes(q) || q.split(/\s+/).some(w => w && c.name.toLowerCase().includes(w)));
      h.act(`“${name}” → ${hits.length ? hits.map(x => x.name).join(", ") : "not found"}`);
      return hits.length ? hits.map(c => ({ name: c.name, email: c.email, note: c.note || "" })) : "No contact found.";
    } },
  { name: "contacts_add", connector: "contacts", writes: true, description: "Contacts connector. Save a new contact. May need the user's approval.",
    inputSchema: { type: "object", properties: { name: S, email: S, note: S }, required: ["name", "email"] },
    run: async ({ name, email, note }, ctx, h) => {
      if (!name || !email) throw new Error("need a name and an email");
      if (h.needsAsk("contacts")) {
        const ok = await h.ask("contacts_add", { heading: "Muse wants to save a new contact. Allow it?", rows: [["Name", String(name)], ["Email", String(email)]], body: note ? String(note) : "", yes: "Save contact", summary: `${name} <${email}>` });
        if (ok !== true) return h.refusal(ok);
      } else h.act(`${name} <${email}>`);
      await ctx.setData({ contacts: [...(ctx.data.contacts || []), { id: "c" + rid(), name: String(name), email: String(email), note: note ? String(note) : "" }] });
      return "Saved.";
    } }
];

export default {
  id: "connectors",
  guidance: [
    "Connected services: look things up with their tools instead of guessing (search mail, list the calendar, look up contacts). Before emailing someone, look up their address with contacts_lookup if Contacts is connected.",
    "If a task needs a service that is not connected, say which connector it needs and that the user can connect it on the Connectors page. Still do the parts you can."
  ],
  tools: [...mail, ...calendar, ...contacts]
};
