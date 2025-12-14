/**
 * Canonical domain state definitions for the life-as-a-game system.
 *
 * This file defines the minimal, present-tense state necessary to:
 * - Evaluate quest availability and completion
 * - Apply quest transitions (stat changes, flag updates)
 * - Handle time drift (stagnation, re-entry logic)
 *
 * All decisions in this file are constrained by:
 * - docs/ethos.md
 * - docs/identity_arc.md
 * - docs/stats.md
 * - docs/quests.md
 * - docs/time.md
 */

// ============================================================================
// Stats
// ============================================================================

/**
 * StatKey: The only three stats that exist in v1.
 *
 * Constraint: identity_arc.md - "No additional traits may be introduced in v1"
 * Constraint: stats.md - "Only three stats exist in v1"
 */
export type StatKey = 'agency' | 'courage' | 'order';

/**
 * Stats: Mapping of stat keys to numeric values.
 *
 * Constraint: stats.md - "Stats are qualitative at heart, even if stored numerically"
 * Constraint: stats.md - "Stats move slowly; no grind loops"
 * Constraint: ethos.md - "Stats change slowly. They are earned, not grinded."
 *
 * Numbers are abstract representations of traits, not XP/levels.
 * Values should change rarely and reflect patterns over time.
 */
export type Stats = Record<StatKey, number>;

// ============================================================================
// Time Context
// ============================================================================

/**
 * TimeRange: Coarse time ranges representing narrative context of meaningful action recency.
 *
 * Constraint: time.md - "Use ranges (e.g., 'recent', 'long gap') instead of exact counts"
 * Constraint: time.md - "Time comparisons should be coarse, not granular"
 * Constraint: time.md - "Precision increases pressure. Ambiguity preserves autonomy."
 * Constraint: time.md - "Avoid daily or weekly resets"
 *
 * Values are intentionally narrative, not calendrical. No durations are encoded.
 * Used to:
 * - Determine narrative tone (acknowledgment vs re-entry)
 * - Surface appropriate quest types (momentum vs preparatory)
 * - Apply stagnation logic (time is neutral; stagnation over decay)
 * - Shape re-entry paths after absence
 */
export type TimeRange = 'recent' | 'gap' | 'long_gap';

/**
 * MomentumState: Qualitative label for momentum presence, derived from recent initiation.
 *
 * Constraint: time.md - "Momentum emerges from recent initiation, not streaks"
 * Constraint: time.md - "Momentum is felt, not counted"
 * Constraint: time.md - "Momentum is implicit, never shown as a number"
 * Constraint: time.md - "Recent Agency actions lower future resistance"
 *
 * This is a label, not a counter. Momentum is typically inferred from TimeRange
 * but may be stored explicitly for narrative purposes or quest gating.
 */
export type MomentumState = 'present' | 'fading' | 'absent';

/**
 * TimeContext: Represents time state for drift and narrative purposes.
 *
 * Constraint: time.md - "Track last meaningful action, not last login"
 * Constraint: time.md - "Time is neutral; stagnation over decay"
 * Constraint: time.md - "Time does not judge. It simply moves forward."
 * Constraint: time.md - "Inactivity is treated as information, not neglect"
 *
 * The range is the primary semantic value, derived from the last meaningful action.
 * Timestamps are included only for calculation purposes (deriving ranges, comparing contexts).
 * The abstraction (range) is preferred for all narrative and quest logic.
 */
export interface TimeContext {
  /** Coarse time range representing narrative recency context */
  range: TimeRange;
  /** Current time in milliseconds (for calculations only, not stored long-term) */
  nowMs: number;
  /** Last meaningful action timestamp in milliseconds (optional, abstract reference) */
  lastMeaningfulActionMs?: number;
}

// ============================================================================
// Flags
// ============================================================================

/**
 * Flags: String set for narrative and quest gating.
 *
 * Used to:
 * - Gate quest availability (flags unlock quests)
 * - Track narrative state (completed arcs, unlocked paths)
 * - Store quest consequences (every quest must change something)
 *
 * Constraint: quests.md - "Every quest must change something: A flag is set"
 * Constraint: ethos.md - "The story adapts instead of scolding"
 */
export type Flags = Set<string>;

// ============================================================================
// Character State
// ============================================================================

/**
 * CharacterState: Minimal present-tense state of the character.
 *
 * Contains only what is necessary to:
 * - Evaluate quest availability (stats, flags, time context)
 * - Apply quest transitions (stats change, flags update)
 * - Handle time drift (time context determines stagnation behavior)
 *
 * Constraint: ethos.md - "Progress is earned only through real action in the real world"
 * Constraint: stats.md - "Stats reflect patterns of behavior over time, not isolated actions"
 * Constraint: time.md - "Inactivity is treated as information, not neglect"
 *
 * Non-goals (not included):
 * - Quest history or event logs (present-tense only)
 * - Analytics or tracking data
 * - Database persistence concerns
 * - UI state or presentation data
 */
export interface CharacterState {
  /** Character stats (agency, courage, order) */
  stats: Stats;
  /** Flags for narrative/quest gating */
  flags: Flags;
  /** Time context for drift and narrative tone */
  timeContext: TimeContext;
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * PartialCharacterState: Used for updates and transitions.
 *
 * Allows partial updates to character state during quest transitions.
 * Flags can be omitted or fully replaced (Set operations handled separately).
 */
export type PartialCharacterState = Partial<Omit<CharacterState, 'stats' | 'flags'>> & {
  stats?: Partial<Stats>;
  flags?: Flags;
};

