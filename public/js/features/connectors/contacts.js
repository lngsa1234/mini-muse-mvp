// Contacts connector (two sample contacts). Adding can require approval.
// Contacts are saved in the user's server-side state, so the agent can use them.
import { $, esc, rid } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { defineConnector, onClick, onSubmit, renderMine } from "../../core/registry.js";
import { save } from "../../core/storage.js";
import { audit } from "../../core/activity.js";

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
  // The tools run in the server agent (server/agent/tools/connectors.js) on state.contacts.
  tools: [{ name: "contacts_lookup", writes: false }, { name: "contacts_add", writes: true }]
});
