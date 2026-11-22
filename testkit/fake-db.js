// An in-memory stand-in for server/db.js (documents and ideas), keyed by user.
// Acceptance tests swap it in with node:test's mock.module.
let n = 0;
const id = p => p + (++n);
export const rows = { docs: [], ideas: [] };
export function reset() { rows.docs.length = 0; rows.ideas.length = 0; }

const none = name => async () => { throw new Error(`fake db: ${name} is not faked`); };

export const fakeDb = {
  sql: () => { throw new Error("fake db: no SQL in tests"); },
  listGoals: none("listGoals"), getGoal: none("getGoal"), createGoal: none("createGoal"), updateGoal: none("updateGoal"), deleteGoal: none("deleteGoal"),
  newId: (p = "d") => id(p),
  listDocs: async userId => rows.docs.filter(d => d.userId === userId).map(({ userId: _, ...d }) => d),
  createDoc: async (userId, d) => { const doc = { id: id("d"), userId, title: d.title, text: d.text || "", contentType: d.contentType || null, size: d.size || null, t: Date.now() }; rows.docs.push(doc); const { userId: _, ...out } = doc; return out; },
  deleteDoc: async (userId, docId) => { const i = rows.docs.findIndex(d => d.userId === userId && d.id === docId); if (i < 0) return null; return { title: rows.docs.splice(i, 1)[0].title }; },
  listIdeas: async userId => rows.ideas.filter(i => i.userId === userId),
  createIdea: async (userId, d) => { const idea = { id: id("i"), userId, ...d }; rows.ideas.push(idea); return idea; },
  updateIdea: async (userId, ideaId, patch) => { const i = rows.ideas.find(v => v.userId === userId && v.id === ideaId); if (!i) return null; Object.assign(i, patch); return i; },
  deleteIdea: async (userId, ideaId) => { const k = rows.ideas.findIndex(v => v.userId === userId && v.id === ideaId); if (k < 0) return null; return rows.ideas.splice(k, 1)[0]; }
};
