// Contacts connector (two sample contacts). Adding can require approval.
import { $, esc, rid } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { defineConnector, onClick, onSubmit, renderMine } from "../../core/registry.js";
import { save } from "../../core/storage.js";
import { audit } from "../../core/activity.js";
import { S } from "../../core/schema.js";

function seed() {
  state.contacts.push(
    { id: "c" + rid(), name: "Maya Chen", email: "maya@example.com", note: "Learning circle member", example: true },
    { id: "c" + rid(), name: "Sam Ortiz", email: "sam@example.com", note: "Learning circle member", example: true });
}

function manageHtml() {
  return `<ul class="plain">${state.contacts.map(c => `<li class="item"><span class="grow"><strong>${esc(c.name)}</strong> ${c.example ? `<span class="tag ex">example</span>` : ""}<br><span class="sub">${esc(c.email)}</span></span><button class="x" data-del-contact="${c.id}" aria-label="Remove contact">×</button></li>`).join("") || `<li><p class="empty">No contacts yet.</p></li>`}</ul>
      <form id="contactForm"><label class="sub" for="cName">Add a contact</label>
        <input class="field" id="cName" placeholder="Name" autocomplete="off"><label for="cEmail" hidden>Email</label><input class="field" id="cEmail" type="email" placeholder="email@example.com" autocomplete="off">
        <div><button class="btn small primary" type="submit">Add contact</button></div></form>`;
}

onSubmit("contactForm", () => {
  const name = $("cName").value.trim(), email = $("cEmail").value.trim(); if (!name || !email) return;
  state.contacts.push({ id: "c" + rid(), name, email, note: "" });
  audit("contacts_add", name, "Added by you", "you"); renderMine(); save();
});
onClick("delContact", id => { const x = state.contacts.find(v => v.id === id); state.contacts = state.contacts.filter(v => v.id !== id); audit("contacts_remove", x?.name, "Removed by you", "you"); renderMine(); save(); });

defineConnector({
  key: "contacts", name: "Contacts", glyph: "Co", like: "Works like your phone's contacts", desc: "Muse can look up people's email addresses and save new contacts.",
  scopes: ["Look up your contacts", "Add new contacts"],
  seed, manageHtml,
  tools: [
    { name: "contacts_lookup", writes: false, description: "Contacts connector. Find people by name or email. Returns name, email and note.",
      inputSchema: { type: "object", properties: { name: S }, required: ["name"] },
      run: ({ name }, _ctx, h) => {
        const q = String(name || "").toLowerCase().trim();
        const hits = state.contacts.filter(c => (c.name + " " + c.email).toLowerCase().includes(q) || q.split(/\s+/).some(w => w && c.name.toLowerCase().includes(w)));
        h.act(`“${name}” → ${hits.length ? hits.map(x => x.name).join(", ") : "not found"}`);
        return hits.length ? hits.map(c => ({ name: c.name, email: c.email, note: c.note || "" })) : "No contact found.";
      } },
    { name: "contacts_add", writes: true, description: "Contacts connector. Save a new contact. May need the user's approval.",
      inputSchema: { type: "object", properties: { name: S, email: S, note: S }, required: ["name", "email"] },
      run: async ({ name, email, note }, context, h) => {
        if (!name || !email) throw new Error("need a name and an email");
        if (h.needsAsk("contacts")) {
          const ok = await h.ask("contacts_add", { heading: "Muse wants to save a new contact. Allow it?", rows: [["Name", String(name)], ["Email", String(email)]], body: note ? String(note) : "", yes: "Save contact", summary: `${name} <${email}>` }, context);
          if (ok !== true) return h.refusal(ok);
        } else h.act(`${name} <${email}>`);
        state.contacts.push({ id: "c" + rid(), name: String(name), email: String(email), note: note ? String(note) : "" });
        return "Saved.";
      } }
  ]
});
