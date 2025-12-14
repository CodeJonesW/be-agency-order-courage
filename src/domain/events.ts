/**
 * Canonical domain event types for the life-as-a-game system.
 *
 * This file defines TypeScript types only (no logic) that represent meaningful
 * consequences of engine transitions. Events are semantic and support stat deltas,
 * flag changes, quest unlocks, and time context changes.
 *
 * All decisions in this file are constrained by:
 * - docs/ethos.md
 * - docs/identity_arc.md
 * - docs/stats.md
 * - docs/quests.md
 * - docs/time.md
 *
 * Non-goals (not included):
 * - Event handling or processing logic
 * - Persistence or logging concerns
 * - Analytics or tracking
 * - UI strings or presentation
 */

import type { StatKey, TimeRange } from './state.js';
import type { QuestId, QuestType, Flag } from './quests.js';

// ============================================================================
// Narrative Support
// ============================================================================

/**
 * NarrativeTone: Optional tone for narrative context.
 *
 * Constraint: time.md - "Narrative references to time must be: Observational, Calm, Non-accusatory, Non-alarmist"
 * Constraint: ethos.md - "Failure is narrative, not punishment"
 * Constraint: time.md - "Never surface guilt through language"
 *
 * Narrative is minimal and optional. Events are semantic; narrative is supplemental.
 */
export type NarrativeTone = 'observational' | 'calm' | 'neutral' | 'acknowledging';

/**
 * NarrativeNote: Optional minimal narrative context for events.
 *
 * Constraint: ethos.md - "In-game narrative teaches"
 * Constraint: quests.md - "Narrative context adjusts" (as part of quest consequences)
 * Constraint: time.md - "Narrative acknowledges closure neutrally"
 *
 * Contains only tone and a messageKey (reference to a narrative fragment),
 * not full prose. Narrative is handled separately from event semantics.
 */
export interface NarrativeNote {
  /** Tone for narrative presentation */
  tone: NarrativeTone;
  /** Reference key for narrative message (not the message itself) */
  messageKey: string;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * QuestStartedEvent: Emitted when a quest is initiated.
 *
 * Constraint: quests.md - "Quests are lived, not completed"
 * Constraint: quests.md - "Completion is not required; Starting is sufficient" (for Agency)
 *
 * Records the initiation of a quest, not its completion.
 */
export interface QuestStartedEvent {
  type: 'quest_started';
  /** Quest ID that was started */
  questId: QuestId;
  /** Quest type (agency, courage, order) */
  questType: QuestType;
  /** Optional narrative note */
  narrative?: NarrativeNote;
}

/**
 * QuestCompletedEvent: Emitted when a quest's consequences are applied.
 *
 * Constraint: quests.md - "Quests are lived, not completed"
 * Constraint: quests.md - "Completion is not required; Starting is sufficient" (for Agency)
 * Constraint: quests.md - "Every quest must change something: A stat shifts, A flag is set, A future quest unlocks"
 *
 * Records that quest consequences have been applied (stat changes, flag changes, unlocks).
 * Completion is semantic: it means consequences were applied, not that a task was finished.
 */
export interface QuestCompletedEvent {
  type: 'quest_completed';
  /** Quest ID that was completed */
  questId: QuestId;
  /** Quest type (agency, courage, order) */
  questType: QuestType;
  /** Optional narrative note */
  narrative?: NarrativeNote;
}

/**
 * StatChangedEvent: Emitted when stat deltas are applied.
 *
 * Constraint: stats.md - "Stats are qualitative at heart, even if stored numerically"
 * Constraint: stats.md - "Stats move slowly; no grind loops"
 * Constraint: stats.md - "No XP points, Levels, Streak multipliers, Daily bonuses"
 * Constraint: stats.md - "Stats reflect patterns of behavior over time, not isolated actions"
 *
 * Represents stat deltas (changes), not absolute values or XP/levels.
 * Stats change slowly and represent traits, not skills.
 */
export interface StatChangedEvent {
  type: 'stat_changed';
  /** Stat deltas (changes, not absolute values) */
  deltas: Partial<Record<StatKey, number>>;
  /** Optional narrative note */
  narrative?: NarrativeNote;
}

/**
 * FlagChangedEvent: Emitted when flags are set or cleared.
 *
 * Constraint: quests.md - "Every quest must change something: A flag is set"
 * Constraint: quests.md - "Flags unlock quests"
 * Constraint: quests.md - "Avoidance unlocks different paths" (flags track paths)
 *
 * Records flag changes (set or cleared) that affect quest availability and narrative state.
 */
export interface FlagChangedEvent {
  type: 'flag_changed';
  /** Flags that were set */
  flagsSet?: Flag[];
  /** Flags that were cleared */
  flagsCleared?: Flag[];
  /** Optional narrative note */
  narrative?: NarrativeNote;
}

/**
 * QuestsUnlockedEvent: Emitted when new quests become available.
 *
 * Constraint: quests.md - "Every quest must change something: A future quest unlocks"
 * Constraint: quests.md - "Harder quests unlock through readiness, not grind"
 * Constraint: quests.md - "Not all quests are visible at once"
 *
 * Indicates that new quests have become available due to quest completion or state changes.
 */
export interface QuestsUnlockedEvent {
  type: 'quests_unlocked';
  /** Quest IDs that are now available */
  questIds: QuestId[];
  /** Optional narrative note */
  narrative?: NarrativeNote;
}

/**
 * TimeContextChangedEvent: Emitted when time context changes (stagnation/re-entry).
 *
 * Constraint: time.md - "Time is neutral; stagnation over decay"
 * Constraint: time.md - "Inactivity is treated as information, not neglect"
 * Constraint: time.md - "Time does not judge. It simply moves forward."
 * Constraint: time.md - "Never surface guilt through language"
 * Constraint: time.md - "Re-entry is about returning to agency, not compensating for time lost"
 *
 * Records time context transitions (e.g., recent → gap, gap → long_gap, or re-entry).
 * No punishment language; time changes are informational and neutral.
 */
export interface TimeContextChangedEvent {
  type: 'time_context_changed';
  /** Previous time range */
  previousRange: TimeRange;
  /** New time range */
  newRange: TimeRange;
  /** Optional narrative note (must be neutral/observational, never accusatory) */
  narrative?: NarrativeNote;
}

/**
 * ReEntrySuggestedEvent: Emitted when re-entry quests should be surfaced.
 *
 * Constraint: time.md - "After meaningful absence, the system must: Acknowledge the gap without judgment, Reduce cognitive load, Offer a single, stabilizing choice"
 * Constraint: time.md - "Re-entry quests are: Small, Grounded, Order- or Courage-focused, No narrative pressure to 'catch up'"
 * Constraint: time.md - "Re-entry is about returning to agency, not compensating for time lost"
 *
 * Suggests that re-entry quests should be offered. This is informational,
 * not punitive. The system acknowledges the gap neutrally.
 */
export interface ReEntrySuggestedEvent {
  type: 're_entry_suggested';
  /** Current time range (gap or long_gap) */
  currentRange: TimeRange;
  /** Optional narrative note (must be calm and non-judgmental) */
  narrative?: NarrativeNote;
}

/**
 * EngineEvent: Union type of all engine events.
 *
 * Constraint: ethos.md - "The system does not command. It does not beg. It does not manipulate."
 * Constraint: ethos.md - "It surfaces: The next meaningful choice, The cost of avoidance, The long-term arc of your actions"
 *
 * All meaningful consequences of engine transitions are represented as events.
 * Events are semantic and support the engine's role of surfacing choices and consequences.
 */
export type EngineEvent =
  | QuestStartedEvent
  | QuestCompletedEvent
  | StatChangedEvent
  | FlagChangedEvent
  | QuestsUnlockedEvent
  | TimeContextChangedEvent
  | ReEntrySuggestedEvent;

