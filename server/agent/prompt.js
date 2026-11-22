/*
 * The system prompt Muse reads every turn, and the chat history sent with it.
 * Built on the server from the user's saved data (ADR-0009), so every device
 * gets the same Muse. "How you work" is each feature's `guidance`
 * (server/agent/tools/*) followed by the general rules below.
 */
import { goalContext } from "../../public/js/features/goals/model.js";
import { ideaTitle, ideaStatus } from "../../public/js/features/ideas/model.js";
import { CHECKIN } from "../../public/js/workflow/checkin-prompt.js";
import { SAFETY_RULES } from "../../public/js/agent/policy.js";
import { guidanceRules } from "./tools/index.js";
import { CONNECTORS, isOn, needsAsk } from "./tools/connectors.js";

export const HISTORY_TURNS = 18;

const GENERAL_RULES = [
  `Some actions need the user's approval. If they decline, accept it and ask what to change. Never claim something happened unless the tool result says it did. Approved Gmail messages are really sent from the user's account.`,
  ...SAFETY_RULES
];

// The user's local date and time (the server runs in another time zone).
export function localNow(now, tz) {
  const opts = { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" };
  try {
    return { text: now.toLocaleString("en-US", { ...opts, timeZone: tz }), iso: now.toLocaleDateString("en-CA", { timeZone: tz }), tz };
  } catch (_) {
    return { text: now.toLocaleString("en-US", { ...opts, timeZone: "UTC" }), iso: now.toISOString().slice(0, 10), tz: "UTC" };
  }
}

// ctx: { data (user_state), googleConnected, tz, now() } ; ideas, goals: lists from the repo.
export function instructions(ctx, ideas, goals) {
  const now = localNow(ctx.now(), ctx.tz);
  const mem = (ctx.data.memory || []).map(f => "- " + f.fact).join("\n") || "(empty)";
  const ideaLines = ideas.filter(i => ideaStatus(i) !== "dismissed").map(i => `- ${i.id}: ${ideaTitle(i)} [${ideaStatus(i)}]${i.goalId ? " (became goal " + i.goalId + ")" : ""}`).join("\n") || "(none)";
  const goalLines = goals.map(p => goalContext(p, ctx.now())).join("\n") || "(none)";
  const conns = Object.entries(CONNECTORS).map(([k, c]) => `- ${c.name}: ${isOn(ctx, k) ? "CONNECTED" + (needsAsk(ctx, k) ? " (changes need the user's approval)" : " (changes allowed without asking)") : "not connected"}`).join("\n");
  const rules = [...guidanceRules(), ...GENERAL_RULES].map((r, i) => `${i + 1}. ${r}`).join("\n");
  return `You are Mini Muse, a personal AI agent (a classroom replica of Meta's Muse). You don't just answer questions; you get things done using your tools.

Current date and time: ${now.text} (${now.tz}). Today's ISO date: ${now.iso}.

The app has five pages: Main Chat (this conversation), Ideas, Goals, Library, and Connectors.

Connectors (services the user chose to connect; you only have tools for connected ones):
${conns}

How you work:
${rules}

What you remember about the user:
${mem}

Ideas:
${ideaLines}

Goals:
${goalLines}`;
}

// Saved chat -> OpenAI messages. `chat` excludes the assistant message being written.
export function buildMessages(system, chat) {
  const out = [{ role: "system", content: system }];
  const push = (role, content) => {
    const last = out[out.length - 1];
    if (last.role === role && out.length > 1) last.content += "\n\n" + content; else out.push({ role, content });
  };
  for (const m of chat.slice(-HISTORY_TURNS)) {
    if (m.role === "checkin") { push("user", CHECKIN); continue; }
    if (m.role === "user") { if (m.text) push("user", m.text); continue; }
    const did = (m.acts || []).map(a => `${a.tool}: ${a.label}`).join("; ");
    const c = (m.text || "") + (did ? `\n(Actions taken: ${did})` : "");
    if (c.trim()) { if (out.length > 1) push("assistant", c); }  // never lead with an assistant turn
  }
  if (out.length === 1) out.push({ role: "user", content: "Hello" });
  return out;
}
