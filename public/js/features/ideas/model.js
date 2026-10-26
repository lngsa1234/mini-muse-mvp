// Idea helpers shared with the prompt and Goals.
// status: "starter" (rule, not stored) | "new" (from Muse) | "saved" | "done" | "dismissed"; "goal" once goalId is set
export const ideaTitle = i => i.title || i.text || "";
export const ideaStatus = i => i.goalId ? "goal" : (i.status || "saved");
export const KINDS = ["Get ahead", "Follow up", "Connect", "Learn", "Take care", "Have fun"];
