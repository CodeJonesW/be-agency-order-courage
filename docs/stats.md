# Stats
## Canonical Trait System (v1)

This document defines the **only stats that exist in v1** of the system.

It is authoritative.
It constrains progression.
It prevents gamification.

If a stat, modifier, or metric is not defined here, **it does not exist**.

---

## Purpose of Stats in This System

Stats do not measure output.
Stats do not reward volume.
Stats do not represent skills.

Stats represent **how the player tends to show up in the world**.

They are:
- Slow-moving
- Hard-earned
- Identity-shaping

Stats exist to reflect *patterns of behavior over time*, not isolated actions.

---

## The v1 Stat Set (Locked)

Only **three stats** exist in v1.

No additional stats may be added without creating a new Identity Arc.

### The Stats

1. **Agency** (Primary)
2. **Courage** (Supporting)
3. **Order** (Stabilizing)

These stats are intentionally minimal.
Depth comes from interaction, not quantity.

---

## 1. Agency

### Definition

**Agency** represents the player’s tendency to **initiate meaningful action without external pressure**.

It is the core measure of the Reactive → Agentic Identity Arc.

Agency answers the question:
> “When something matters, do you begin?”

---

### What Increases Agency

Agency increases only when the player:
- Initiates a real-world action
- Begins without full certainty
- Starts something they were avoiding
- Takes the first step of a meaningful decision

Completion is not required.
Initiation is sufficient.

---

### What Does *Not* Increase Agency

Agency does **not** increase from:
- Finishing easy or habitual tasks
- Repeating comfortable routines
- Checking boxes
- Passive consumption
- In-game-only actions

If discomfort or uncertainty is absent, Agency does not move.

---

### Behavioral Signal (for Agents)

Agency growth should correlate with:
- Reduced delay between intent and action
- Fewer preparatory actions before starting
- Willingness to act with incomplete information

Agents should prefer **fewer, heavier Agency gains** over frequent small ones.

---

## 2. Courage

### Definition

**Courage** represents the player’s willingness to **face discomfort, uncertainty, or social risk**.

Courage supports Agency but is not the end goal itself.

Courage answers the question:
> “Will I face this even if it’s uncomfortable?”

---

### What Increases Courage

Courage increases when the player:
- Engages in avoided conversations
- Risks social or emotional discomfort
- Exposes imperfect work
- Acts despite fear of judgment or failure

Courage is about **emotional cost**, not physical difficulty.

---

### What Does *Not* Increase Courage

Courage does **not** increase from:
- Physical exertion alone
- Routine exposure without emotional risk
- Forced or externally compelled actions
- Actions taken purely out of obligation

If the action does not feel vulnerable, Courage does not move.

---

### Relationship to Agency

- Courage **unlocks** harder Agency quests
- Low Courage may gate certain initiations
- Courage growth makes Agency cheaper over time

Courage is fuel, not progress.

---

## 3. Order

### Definition

**Order** represents the player’s ability to **reduce friction through environment and systems**.

Order stabilizes progress and prevents burnout.

Order answers the question:
> “Have I shaped my environment to support action?”

---

### What Increases Order

Order increases when the player:
- Removes physical or digital friction
- Simplifies their environment
- Prepares future actions
- Creates systems that reduce decision load

Order actions are typically small but compounding.

---

### What Does *Not* Increase Order

Order does **not** increase from:
- Large, aesthetic cleanups without functional impact
- Over-planning without execution
- Productivity theater
- System-building detached from real use

Order must directly reduce future friction.

---

### Relationship to Other Stats

- Higher Order lowers the perceived cost of Agency
- Order does not replace Courage
- Order supports consistency but does not drive narrative progression

Order keeps the engine running smoothly.

---

## Stat Interaction Model (High-Level)

- **Agency** drives narrative progression
- **Courage** gates difficulty and depth
- **Order** reduces friction and fatigue

No stat exists in isolation.
Growth emerges from interaction, not optimization.

---

## Rate of Change (Critical Constraint)

Stats must change **slowly**.

Rules:
- No stat should visibly change multiple times per day
- Single actions should not create large jumps
- Progress should feel earned in retrospect, not immediate

If a player can “grind” stats, the system is broken.

---

## Stagnation and Drift

- Stats do not decay rapidly
- Inactivity causes **stagnation**, not loss
- Long-term avoidance may slow future gains
- Narrative acknowledges drift without penalty

Stats reflect patterns, not lapses.

---

## Forbidden Mechanics (Explicitly Banned)

The following are **not allowed** in v1:

- XP points
- Levels
- Streak multipliers
- Daily bonuses
- Numeric optimization loops
- Leaderboards or comparisons

Stats are **qualitative at heart**, even if stored numerically.

---

## Agent Design Rules

When implementing or extending stat logic, agents must:

1. Reference `ethos.md`
2. Confirm alignment with `identity_arc.md`
3. Justify how a stat change reflects real-world behavior
4. Prefer fewer updates over frequent feedback
5. Reject mechanics that reward compliance over choice

If uncertain, **do less**.

---

## Final Principle

Stats do not exist to motivate action.

They exist to **tell the truth** about how the player is living.

If the truth becomes noisy, flattering, or addictive,
the stat system has failed.

