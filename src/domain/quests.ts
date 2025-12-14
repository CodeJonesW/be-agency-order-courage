/**
 * Canonical quest type definitions for the life-as-a-game system.
 *
 * This file defines TypeScript types only (no logic) that represent:
 * - Quest identification and categorization
 * - Quest structure matching docs/quests.md requirements
 * - Quest availability/gating conditions (stat and flag dependencies)
 *
 * All decisions in this file are constrained by:
 * - docs/quests.md
 * - docs/identity_arc.md
 * - docs/ethos.md
 *
 * Non-goals (not included):
 * - Quest evaluation logic
 * - Quest graph traversal
 * - Quest completion handlers
 * - UI presentation
 * - Persistence concerns
 */

import type { StatKey, TimeRange } from './state.js';

// ============================================================================
// Quest Identity
// ============================================================================

/**
 * QuestId: Unique identifier for a quest node in the quest graph.
 *
 * Constraint: quests.md - "Quests exist in a graph, not a flat list"
 */
export type QuestId = string;

/**
 * QuestType: The only three quest types that exist in v1.
 *
 * Constraint: identity_arc.md - "Only three stats exist in v1" (aligned quest types)
 * Constraint: quests.md - "Quests are categorized by intent, not difficulty"
 * Constraint: identity_arc.md - "Agency is the primary trait; Courage supporting; Order stabilizing"
 *
 * Each type corresponds to a stat and represents a different intent:
 * - Agency: Initiation without certainty
 * - Courage: Facing emotional or social discomfort
 * - Order: Reducing friction for future action
 */
export type QuestType = 'agency' | 'courage' | 'order';

// ============================================================================
// Flags
// ============================================================================

/**
 * Flag: Individual flag identifier used for narrative and quest gating.
 *
 * Constraint: quests.md - "Flags unlock quests"
 * Constraint: quests.md - "Every quest must change something: A flag is set"
 */
export type Flag = string;

// ============================================================================
// Quest Structure
// ============================================================================

/**
 * QuestContext: Why this action matters now.
 *
 * Constraint: quests.md - "Context answers: Why this moment? Why this action? What pattern is being interrupted?"
 * Constraint: quests.md - "Without context, a quest becomes a task"
 *
 * Context provides narrative meaning, not just task description.
 */
export type QuestContext = string;

/**
 * QuestAction: A real-world action that must be taken outside the system.
 *
 * Constraint: quests.md - "The player must leave the interface to progress"
 * Constraint: quests.md - "The system does not simulate effort"
 * Constraint: identity_arc.md - "No mechanic may bypass real-world initiation"
 *
 * Describes the concrete action required, not an in-system action.
 */
export type QuestAction = string;

/**
 * QuestConstraint: A meaningful limitation that creates friction.
 *
 * Constraint: quests.md - "Constraints prevent optimization and force presence"
 *
 * Examples: time-boxing, emotional restraint, no preparation allowed, imperfect execution
 */
export type QuestConstraint = string;

/**
 * QuestReflection: Optional reflection prompt (at most one).
 *
 * Constraint: quests.md - "Reflection exists to surface awareness, not compliance"
 * Constraint: quests.md - "Allowed formats: Single question, Binary choice, Short phrase selection"
 * Constraint: quests.md - "If reflection feels like journaling, it is too heavy"
 *
 * If provided, this is a single prompt, never a list or lengthy form.
 */
export type QuestReflection = string;

/**
 * QuestConsequence: What changes when this quest is completed.
 *
 * Constraint: quests.md - "Every quest must change something: A stat shifts, A flag is set, A future quest unlocks, Narrative context adjusts"
 * Constraint: quests.md - "If nothing changes, the quest did not matter"
 *
 * Describes the state changes (stat shifts, flag sets) that result from quest completion.
 * Evaluation logic is not included here; this is just the type definition.
 */
export interface QuestConsequence {
  /** Stat changes (delta values, not absolute) */
  statChanges?: Partial<Record<StatKey, number>>;
  /** Flags to set (added to character flags) */
  flagsToSet?: Flag[];
  /** Flags to clear (removed from character flags) */
  flagsToClear?: Flag[];
  /** Quest IDs that become available after this quest (unlocked) */
  unlocksQuests?: QuestId[];
}

/**
 * QuestNode: Complete quest structure matching docs/quests.md requirements.
 *
 * Constraint: quests.md - "Every quest must contain all of: Context, Real-World Action, Constraint, Optional Reflection, Consequence"
 * Constraint: quests.md - "A quest represents a deliberate decision to act differently than default"
 * Constraint: quests.md - "Quests are lived, not completed"
 *
 * This is a node in the quest graph. It contains everything needed to present
 * and evaluate a quest, but does not include availability logic (see QuestAvailability).
 */
export interface QuestNode {
  /** Unique identifier in the quest graph */
  id: QuestId;
  /** Quest type (agency, courage, or order) */
  type: QuestType;
  /** Why this action matters now */
  context: QuestContext;
  /** Real-world action required */
  realWorldAction: QuestAction;
  /** Constraint that creates friction */
  constraint: QuestConstraint;
  /** Optional reflection prompt (at most one) */
  reflection?: QuestReflection;
  /** Consequence of completion (state changes) */
  consequence: QuestConsequence;
}

// ============================================================================
// Quest Availability / Gating
// ============================================================================

/**
 * StatRequirement: Minimum stat threshold required for quest availability.
 *
 * Constraint: quests.md - "Stats gate availability"
 * Constraint: quests.md - "Harder quests unlock through readiness, not grind"
 * Constraint: identity_arc.md - "Avoidance does not reduce stats" (gating is one-way)
 *
 * Represents minimum stat values required. Evaluation logic is not included.
 */
export interface StatRequirement {
  /** Minimum value for each stat (undefined means no requirement) */
  minimum?: Partial<Record<StatKey, number>>;
}

/**
 * FlagRequirement: Flag-based gating for quest availability.
 *
 * Constraint: quests.md - "Flags unlock quests"
 * Constraint: quests.md - "Avoidance unlocks different paths" (flags track paths taken)
 *
 * Represents flag conditions that must be met (or not met) for availability.
 * Evaluation logic is not included.
 */
export interface FlagRequirement {
  /** Flags that must be present (all required) */
  required?: Flag[];
  /** Flags that must be absent (any blocks availability) */
  blocked?: Flag[];
}

/**
 * QuestAvailability: Conditions that determine if a quest is available.
 *
 * Constraint: quests.md - "Not all quests are visible at once"
 * Constraint: quests.md - "Choice scarcity increases intention"
 * Constraint: quests.md - "Time influences relevance" (time-based gating handled separately)
 * Constraint: quests.md - "Fewer choices are preferred"
 *
 * This structure describes gating conditions but does not evaluate them.
 * Evaluation logic belongs in the engine, not in type definitions.
 *
 * All conditions must be satisfied for a quest to be available.
 * If any requirement is missing, that condition is not checked.
 */
export interface QuestAvailability {
  /** Stat requirements (minimum thresholds) */
  stats?: StatRequirement;
  /** Flag requirements (must have, must not have) */
  flags?: FlagRequirement;
  /**
   * Optional time-based relevance hints.
   * This is a hint for narrative relevance, not a hard gate.
   * Actual time-based filtering handled by engine logic.
   */
  relevance?: {
    /** Quest is more relevant during these time ranges */
    preferredRanges?: TimeRange[];
  };
}

/**
 * QuestNodeWithAvailability: Quest node with its availability conditions.
 *
 * Constraint: quests.md - "Quests exist in a graph, where: Stats gate availability, Avoidance unlocks different paths, Time influences relevance"
 *
 * Combines quest structure with availability gating. This is the complete
 * representation of a quest node in the graph.
 */
export interface QuestNodeWithAvailability extends QuestNode {
  /** Availability conditions (gating) */
  availability: QuestAvailability;
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * QuestGraph: Collection of quest nodes forming the quest graph.
 *
 * Constraint: quests.md - "Agents must never present quests as a flat list"
 * Constraint: quests.md - "Quests exist in a graph, not a flat list"
 *
 * Maps quest IDs to quest nodes. Graph traversal logic is not included here.
 * Uses Record for JSON serialization compatibility.
 */
export type QuestGraph = Record<QuestId, QuestNodeWithAvailability>;

