/*
 * The system prompt Muse reads every turn, and the chat history sent with it.
 * ---------------------------------------------------------------------------
 * "How you work" is assembled from each feature's `guidance` (in feature load
 * order, see main.js) followed by the general rules below. To change how Muse
 * uses your feature's tools, edit your feature's guidance, not this file.
 */
import { TZ } from "../core/dom.js";
import { state, isOn } from "../core/state.js";
import { features, CONNECTORS } from "../core/registry.js";
import { ideaTitle, ideaStatus } from "../features/ideas/model.js";
import { CHECKIN } from "../workflow/checkin.js";
import { SAFETY_RULES } from "./policy.js";

const GENERAL_RULES = [
  `Some actions need the user's approval. If they decline, accept it and ask what to change. Never claim something happened unless the tool result says it did. Emails are simulated in this demo: approved mail goes to "Sent mail", not the real world.`,
  ...SAFETY_RULES
];

export function instructions() {
  const now = new Date();
  const mem = state.memory.map(f => "- " + f.fact).join("\n") || "(empty)";
  const ideas = state.ideas.filter(i => ideaStatus(i) !== "dismissed").map(i => `- ${i.id}: ${ideaTitle(i)} [${ideaStatus(i)}]${i.goalId ? " (became goal " + i.goalId + ")" : ""}`).join("\n") || "(none)";
  const goals = state.plans.map(p => `Goal ${p.id}: ${p.goal}\n` + p.steps.map((s, i) => `  ${i + 1}. [${s.status}] ${s.text}`).join("\n")).join("\n") || "(none)";
  const conns = Object.entries(CONNECTORS).map(([k, c]) => `- ${c.name}: ${isOn(k) ? "CONNECTED" + (c.readOnly ? " (read-only)" : state.connectors[k].writes === "ask" || c.lockAsk ? " (changes need the user's approval)" : " (changes allowed without asking)") : "not connected"}`).join("\n");
  const rules = [...features.flatMap(f => [].concat(f.guidance || [])), ...GENERAL_RULES].map((r, i) => `${i + 1}. ${r}`).join("\n");
  return `You are Mini Muse, a personal AI agent (a classroom replica of Meta's Muse). You don't just answer questions; you get things done using your tools.

Current date and time: ${now.toLocaleString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })} (${TZ}). Today's ISO date: ${now.toLocaleDateString("en-CA")}.

The app has five pages: Main Chat (this conversation), Ideas, Goals, Library, and Connectors.

Connectors (services the user chose to connect; you only have tools for connected ones):
${conns}

How you work:
${rules}

What you remember about the user:
${mem}

Ideas:
${ideas}

Goals:
${goals}`;
}

// Turn the saved chat into model turns (agent/loop.js normalizes them).
export function buildInput() {
  const turns = [{ role: "user", content: instructions() }];
  for (const m of state.chat.slice(-18)) {
    if (m.role === "checkin") { turns.push({ role: "user", content: CHECKIN }); continue; }
    if (m.role === "user") { turns.push({ role: "user", content: m.text }); continue; }
    const did = (m.acts || []).map(a => `${a.tool}: ${a.label}`).join("; ");
    const c = (m.text || "") + (did ? `\n(Actions taken: ${did})` : "");
    if (c.trim()) turns.push({ role: "assistant", content: c });
  }
  return turns;
}
