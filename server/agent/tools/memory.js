// Memory: remember / forget. Facts live in user_state.memory on the server, so
// every device's Muse knows the same things.
import { randomBytes } from "node:crypto";
import { S } from "./schema.js";

const rid = () => randomBytes(4).toString("hex");

export default {
  id: "memory",
  guidance: "Memory: when the user shares a lasting fact or preference, call remember. When they ask you to forget something, call forget.",
  tools: [
    { name: "remember", description: "Save one lasting fact or preference about the user. Returns a confirmation.",
      inputSchema: { type: "object", properties: { fact: S }, required: ["fact"] },
      run: async ({ fact }, ctx, h) => {
        fact = String(fact || "").trim(); if (!fact) throw new Error("fact is empty");
        const memory = ctx.data.memory || [];
        if (memory.some(f => f.fact.toLowerCase() === fact.toLowerCase())) return "Already remembered.";
        await ctx.setData({ memory: [...memory, { id: rid(), fact, t: Date.now() }] });
        h.act(fact); return "Saved to memory.";
      } },
    { name: "forget", description: "Delete the memories containing the keyword. When more than one matches, the user is asked to confirm the list first. Returns what was removed.",
      inputSchema: { type: "object", properties: { keyword: S }, required: ["keyword"] },
      run: async ({ keyword }, ctx, h) => {
        const k = String(keyword || "").toLowerCase().trim(); if (!k) throw new Error("keyword is empty");
        const memory = ctx.data.memory || [];
        const gone = memory.filter(f => f.fact.toLowerCase().includes(k));
        if (!gone.length) return "No memory matched '" + keyword + "'.";
        // One keyword can catch more than the user meant: list them and ask first.
        if (gone.length > 1) {
          const ok = await h.ask("forget", { heading: `Forget these ${gone.length} things Muse remembers?`, rows: gone.map((g, i) => [String(i + 1), g.fact]), yes: "Forget them", summary: `forget ${gone.length} facts matching “${keyword}”` });
          if (ok !== true) return h.refusal(ok);
        }
        await ctx.setData({ memory: memory.filter(f => !gone.includes(f)) });
        h.act("Forgot: " + gone.map(g => g.fact).join("; ")); return { removed: gone.map(g => g.fact) };
      } }
  ]
};
