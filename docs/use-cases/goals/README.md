---
title: Goals use cases
type: Use cases
owner: Maya (Product Manager)
---

# Goals use cases

_Written by Maya on 2026-11-17._

I wrote six use cases for Goals. They cover creating and tracking goals, working through steps, proving progress with tool evidence, measurable targets and deadlines, the job-application tracker, and plan revisions that need approval. No template existed in the repository, so the first section is a reusable one. 

## Use cases

- [UC-1: Capture a goal and have Muse plan it](uc-1-capture-a-goal-and-have-muse-plan-it.md) — “I type a goal and Muse makes a plan I can follow.”
- [UC-2: Muse works through goal steps](uc-2-muse-works-through-goal-steps.md) — “Move my goal forward and tell me what you need from me.”
- [UC-3: Verify step progress with tool evidence](uc-3-verify-step-progress-with-tool-evidence.md) — “I only want a step marked done when something was really done.”
- [UC-4: Set a measurable target and deadline](uc-4-set-a-measurable-target-and-deadline.md) — “Land 3 interviews in 30 days, and show me how I'm doing.”
- [UC-5: Track job applications with proof](uc-5-track-job-applications-with-proof.md) — “Keep track of each job I'm pursuing, from found to outcome.”
- [UC-6: Revise a plan with approval](uc-6-revise-a-plan-with-approval.md) — “Change my plan — reword, add, or remove steps — without losing progress.”

## Use case template

**UC-<n>: <goal-oriented title>**
- **Actor(s):** who starts it, plus the agent (Muse) and any systems
- **User goal (in the user's words):**
- **Trigger:**
- **Preconditions:**
- **Main flow:** table with columns Step | Who (user/agent) | Action | Tool or API | Evidence produced
- **Approval points:** where the agent must stop and ask
- **Alternative and failure flows:**
- **Guardrails (agent must never):**
- **Success criteria / postconditions:** Given / When / Then, checkable from evidence
- **Surface:** web only today (browser app plus Express/Vercel API)
- **Open questions:**
