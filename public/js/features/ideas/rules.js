// Starter ideas: simple rules over your data — instant, free, same result every time.
import { state, isOn } from "../../core/state.js";
import { CONNECTORS } from "../../core/registry.js";
import { fmtWhen } from "../../core/format.js";

export function ruleIdeas() {
  const out = [], skip = new Set(state.skippedRules || []);
  const add = o => { if (!skip.has(o.key) && !state.ideas.some(i => i.ruleKey === o.key)) out.push({ ...o, id: "r:" + o.key, status: "starter", t: Date.now() }); };
  if (!state.memory.length) add({ key: "intro", kind: "Get ahead", title: "Tell Muse a few things about you", why: "Muse doesn't know you yet, so its help is still generic.", basedOn: ["memory"], action: "Ask me 3 quick questions to get to know me, one at a time, and remember my answers." });
  if (isOn("mail")) state.inbox.filter(m => m.unread).slice(0, 2).forEach(m => {
    const who = m.from.split(/[<@]/)[0].trim().split(" ")[0] || "them";
    add({ key: "reply:" + m.id, kind: "Follow up", title: `Reply to ${who}: ${m.subject}`, why: "This email is still unread.", basedOn: ["mail"], action: `Read the email "${m.subject}" (id ${m.id}) and draft a reply for me to approve.` });
  });
  else add({ key: "conn-mail", kind: "Get ahead", title: "Connect Mail so Muse can watch your inbox", why: "With Mail connected, Muse can point out emails that need you.", basedOn: ["connectors"], action: "go:connectors" });
  if (isOn("calendar")) {
    const now = Date.now(), wk = now + 7 * 864e5;
    const e = state.events.filter(x => { const t = new Date(x.start).getTime(); return t > now && t < wk; }).sort((a, b) => new Date(a.start) - new Date(b.start))[0];
    if (e) add({ key: "prep:" + e.id, kind: "Get ahead", title: `Get ready for ${e.title}`, why: `It's coming up on ${fmtWhen(e.start)}.`, basedOn: ["calendar"], action: `Help me prepare for "${e.title}" on ${fmtWhen(e.start)}: make a short checklist.` });
  }
  const open = state.plans.map(g => ({ g, i: g.steps.findIndex(s => s.status !== "done") })).filter(x => x.i >= 0);
  if (open.length) open.slice(0, 2).forEach(({ g, i }) => add({ key: `step:${g.id}:${i}`, kind: "Get ahead", title: `Next step: ${g.steps[i].text}`, why: `It moves your goal “${g.goal}” forward.`, basedOn: ["goals"], action: `Help me with the next step of my goal ${g.id} ("${g.goal}"): ${g.steps[i].text}.` }));
  else add({ key: "first-goal", kind: "Get ahead", title: "Set one goal for this month", why: "Muse works best when it knows what you're aiming for.", basedOn: ["goals"], action: "Help me choose one goal for this month. Ask me a couple of questions first, then make a plan." });
  if (state.docs.length) { const d = state.docs[state.docs.length - 1]; add({ key: "sum:" + d.id, kind: "Learn", title: `Get the key points of “${d.title}”`, why: "A short summary makes your notes easier to act on.", basedOn: ["library"], action: `Summarize the document "${d.title}" (id ${d.id}) in 5 bullet points.` }); }
  const day = new Date().getDay(), today = new Date().toLocaleDateString("en-CA");
  if (day === 0 || day === 1) add({ key: "week:" + today, kind: "Get ahead", title: "Plan your week in 10 minutes", why: "The start of the week is the easiest time to set priorities.", basedOn: ["timing"], action: "Help me plan my week: ask what's on my plate, then suggest my top 3 priorities." });
  if (day === 5 || day === 6) add({ key: "weekend:" + today, kind: "Have fun", title: "Pick one thing to enjoy this weekend", why: "It's the weekend; a small plan makes it more likely to happen.", basedOn: ["timing"], action: "Suggest three small things I could enjoy this weekend, based on what you know about me." });
  return out.slice(0, 4);
}

// Changes when anything Muse bases ideas on changes; used to decide when to regenerate.
export function ideasFingerprint() {
  return JSON.stringify([state.memory.map(f => f.fact), state.plans.map(p => [p.goal, p.steps.map(s => s.status)]),
    isOn("calendar") ? state.events.map(e => e.id) : 0, isOn("mail") ? state.inbox.map(m => m.id + m.unread) : 0,
    state.docs.map(d => d.id), Object.keys(CONNECTORS).filter(isOn)]);
}
