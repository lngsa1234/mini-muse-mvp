/*
 * Feature + connector registry and a tiny event bus.
 * ---------------------------------------------------------------------------
 * Every area of the app (Ideas, Goals, Library, each connector, ...) registers
 * itself here instead of being wired into one big file. Core code only ever
 * loops over what's registered, so you can work on one feature without
 * touching the others. See docs/ARCHITECTURE.md for the full contract.
 *
 * defineFeature({
 *   id,                 // "ideas"
 *   nav: { el, badge }, // optional sidebar counter: element id + () => text
 *   tools: [ ... ],     // optional agent tools (see agent/tools.js)
 *   guidance: "...",    // optional rule added to the system prompt's "How you work"
 *   render(),           // re-render this feature's page from state
 *   onShow(),           // optional: user navigated to this feature's page
 *   beforeRenderAll(),  // optional: runs first on a full re-render (boot, reset)
 *   renderAll(),        // optional: extra work on a full re-render
 * })
 *
 * defineConnector({ key, name, glyph, like, desc, scopes, lockAsk?, readOnly?,
 *                   seed?(), manageHtml(), tools: [ {name, writes, ...} ] })
 */

/* ---------- features ---------- */
export const features = [];
export function defineFeature(f) { features.push(f); return f; }
export const feature = id => features.find(f => f.id === id);

/* ---------- connectors ---------- */
export const CONNECTORS = {};
export function defineConnector(c) { CONNECTORS[c.key] = c; return c; }
// Is this tool / activity name one of a connector's? (mail_search, contacts_add, ...)
export const isConnTool = n => Object.keys(CONNECTORS).some(k => String(n).startsWith(k + "_"));

/* ---------- event bus ---------- */
const listeners = {};
export function on(name, fn) { (listeners[name] ||= []).push(fn); }
export function emit(name, ...args) { for (const fn of listeners[name] || []) fn(...args); }

/* ---------- delegated UI events ---------- */
// onClick("doIdea", (value, dataset, button) => ...) fires for <button data-do-idea="...">
const clicks = [];
export function onClick(key, fn) { clicks.push([key, fn]); }
// onSubmit("docForm", e => ...) fires for <form id="docForm">; default is prevented for you.
const submits = {};
export function onSubmit(formId, fn) { submits[formId] = fn; }

export function installDelegates() {
  document.addEventListener("click", e => {
    const t = e.target.closest("button"); if (!t) return;
    const d = t.dataset;
    for (const [key, fn] of clicks) if (d[key] !== undefined) { fn(d[key], d, t); return; }
  });
  document.addEventListener("submit", e => {
    const fn = submits[e.target.id]; if (!fn) return;
    e.preventDefault(); fn(e);
  });
}

/* ---------- rendering ---------- */
// Cheap re-render of every page after state changes.
export function renderMine() {
  for (const f of features) if (f.nav) { const el = document.getElementById(f.nav.el); if (el) el.textContent = f.nav.badge(); }
  for (const f of features) f.render?.();
}
// Full re-render (boot, reset): includes chat log and activity.
export function renderAll() {
  for (const f of features) f.beforeRenderAll?.();
  renderMine();
  for (const f of features) f.renderAll?.();
}
