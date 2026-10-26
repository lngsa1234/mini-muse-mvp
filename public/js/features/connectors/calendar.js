// Calendar connector. Starts empty; Muse adds events. Changes can require approval.
import { esc, rid } from "../../core/dom.js";
import { fmtWhen } from "../../core/format.js";
import { state } from "../../core/state.js";
import { defineConnector, onClick, renderMine } from "../../core/registry.js";
import { save } from "../../core/storage.js";
import { audit } from "../../core/activity.js";
import { S } from "../../core/schema.js";

function manageHtml() {
  const ev = [...state.events].sort((a, b) => new Date(a.start) - new Date(b.start));
  return ev.length ? `<ul class="plain">${ev.map(e => `<li class="item"><span class="grow"><strong>${esc(e.title)}</strong><br><span class="sub">${esc(fmtWhen(e.start))}</span>${e.notes ? `<br><span style="font-size:12.5px;color:var(--muted)">${esc(e.notes)}</span>` : ""}</span><button class="x" data-del-ev="${e.id}" aria-label="Remove event">×</button></li>`).join("")}</ul>`
    : `<p class="empty">No events yet. Ask Muse to schedule something.</p>`;
}

onClick("delEv", id => { const ev = state.events.find(x => x.id === id); state.events = state.events.filter(x => x.id !== id); audit("calendar_remove", { title: ev?.title }, "Removed by you", "you"); renderMine(); save(); });

defineConnector({
  key: "calendar", name: "Calendar", glyph: "Ca", like: "Works like Google Calendar", desc: "Muse can see your schedule, spot clashes, and add or remove events.",
  scopes: ["See your events", "Add and remove events"],
  manageHtml,
  tools: [
    { name: "calendar_list", writes: false, description: "Calendar connector. List events, optionally only those on or after from_date (YYYY-MM-DD). Returns id, title, start, end, notes.",
      inputSchema: { type: "object", properties: { from_date: S } },
      run: ({ from_date }, _ctx, h) => {
        const from = from_date ? new Date(from_date + "T00:00") : null;
        const list = [...state.events].filter(e => !from || isNaN(from) || new Date(e.start) >= from).sort((a, b) => new Date(a.start) - new Date(b.start));
        h.act(`${list.length} events`);
        return list.map(e => ({ id: e.id, title: e.title, start: e.start, end: e.end, notes: e.notes }));
      } },
    { name: "calendar_add", writes: true, description: "Calendar connector. Add an event. start and end are local ISO times like 2026-10-28T19:00. May need the user's approval. Returns the event_id and any clashing events.",
      inputSchema: { type: "object", properties: { title: S, start: S, end: S, notes: S }, required: ["title", "start"] },
      run: async ({ title, start, end, notes }, context, h) => {
        const st = new Date(start); if (!title || isNaN(st)) throw new Error("need a title and a valid start time");
        const en = end && !isNaN(new Date(end)) ? new Date(end) : new Date(st.getTime() + 3600000);
        const clash = state.events.filter(e => { const a = new Date(e.start), b = e.end ? new Date(e.end) : new Date(a.getTime() + 3600000); return a < en && b > st; });
        if (h.needsAsk("calendar")) {
          const ok = await h.ask("calendar_add", { heading: "Muse wants to add this to your calendar. Allow it?", rows: [["Event", String(title)], ["When", fmtWhen(start)], ...(clash.length ? [["Clashes with", clash.map(c => c.title).join(", ")]] : [])], body: notes ? String(notes) : "", yes: "Add event", summary: `${title} · ${fmtWhen(start)}` }, context);
          if (ok !== true) return h.refusal(ok);
        }
        const id = "e" + rid();
        state.events.push({ id, title: String(title), start: String(start), end: end ? String(end) : "", notes: notes ? String(notes) : "" });
        if (!h.needsAsk("calendar")) h.act(`${title} · ${fmtWhen(start)}`);
        return { event_id: id, clashes: clash.map(c => c.title + " @ " + c.start) };
      } },
    { name: "calendar_remove", writes: true, description: "Calendar connector. Remove an event by event_id. May need the user's approval.",
      inputSchema: { type: "object", properties: { event_id: S }, required: ["event_id"] },
      run: async ({ event_id }, context, h) => {
        const e = state.events.find(x => x.id === String(event_id)); if (!e) throw new Error("no event " + event_id);
        if (h.needsAsk("calendar")) {
          const ok = await h.ask("calendar_remove", { heading: "Muse wants to remove this event. Allow it?", rows: [["Event", e.title], ["When", fmtWhen(e.start)]], yes: "Remove event", summary: `remove ${e.title}` }, context);
          if (ok !== true) return h.refusal(ok);
        } else h.act(e.title);
        state.events = state.events.filter(x => x !== e); return "Removed.";
      } }
  ]
});
