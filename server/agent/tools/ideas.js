// Ideas: save_idea.
import { S } from "./schema.js";
import { ideaTitle } from "../../../public/js/features/ideas/model.js";

export default {
  id: "ideas",
  guidance: `Ideas: the Ideas page holds suggestions you make for the user. When the user shares a loose idea, says "idea:", or asks you for ideas, call save_idea (one call per idea) and keep them specific to what you know about them. Ideas are not commitments; don't plan them unless asked.`,
  tools: [
    { name: "save_idea", description: "Save an idea to the user's Ideas page, either one the user shares or one you suggest. title is a short action; why is one sentence. Returns the idea_id.",
      inputSchema: { type: "object", properties: { title: S, why: S }, required: ["title"] },
      run: async ({ title, why, idea }, ctx, h) => {
        const text = String(title || idea || "").trim(); if (!text) throw new Error("title is empty");
        if ((await ctx.ideas()).some(i => ideaTitle(i).toLowerCase() === text.toLowerCase())) return "Already on the Ideas page.";
        const created = await ctx.repo.createIdea({ title: text, why: why ? String(why) : "", kind: "Get ahead", basedOn: ["chat"], action: text, status: "saved", by: "muse" });
        ctx.changed("ideas");
        h.act(text); return { idea_id: created.id };
      } }
  ]
};
