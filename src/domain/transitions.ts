/**
 * Pure state transition functions for the life-as-a-game system.
 *
 * This file implements pure functions (no side effects, no IO, no persistence)
 * that transition CharacterState and emit EngineEvent arrays.
 *
 * All decisions in this file are constrained by:
 * - docs/ethos.md
 * - docs/identity_arc.md
 * - docs/stats.md
 * - docs/quests.md
 * - docs/time.md
 *
 * Non-goals (not included):
 * - Quest availability evaluation (belongs in rules)
 * - Quest graph traversal
 * - Persistence or storage
 * - HTTP routes
 * - Analytics or logging
 * - Verification of real-world completion (trust-based)
 */

import type {
  CharacterState,
  Stats,
  StatKey,
  TimeRange,
  TimeContext,
  Flags,
} from './state.js';
import type { QuestId, QuestType, QuestNodeWithAvailability, Flag } from './quests.js';
import type {
  EngineEvent,
} from './events.js';

// ============================================================================
// Time Range Calculation
// ============================================================================

/**
 * COARSE_DEFAULT_TIME_THRESHOLDS_MS: Coarse time range boundaries for computing TimeRange.
 *
 * Constraint: time.md - "Time comparisons should be coarse, not granular"
 * Constraint: time.md - "Use ranges instead of exact counts"
 * Constraint: time.md - "Precision increases pressure. Ambiguity preserves autonomy."
 * Constraint: time.md - "Values are intentionally narrative, not calendrical. Durations exist only as coarse defaults; the meaning remains narrative."
 *
 * These are coarse defaults used internally for TimeRange calculation.
 * They are intentionally imprecise to avoid pressure and preserve ambiguity.
 * The actual time semantics remain narrative (recent/gap/long_gap), not calendrical.
 */
const COARSE_DEFAULT_TIME_THRESHOLDS_MS = {
  RECENT: 2 * 24 * 60 * 60 * 1000, // ~2 days
  LONG_GAP: 7 * 24 * 60 * 60 * 1000, // ~7 days
} as const;

/**
 * Computes TimeRange from time elapsed since last meaningful action.
 *
 * Constraint: time.md - "Track last meaningful action, not last login"
 * Constraint: time.md - "Values are intentionally narrative, not calendrical"
 *
 * Pure function: no side effects, deterministic.
 */
function computeTimeRange(
  lastMeaningfulActionMs: number | undefined,
  nowMs: number
): TimeRange {
  if (lastMeaningfulActionMs === undefined) {
    return 'long_gap'; // No history = long gap
  }

  const elapsedMs = Math.max(0, nowMs - lastMeaningfulActionMs);

  if (elapsedMs < COARSE_DEFAULT_TIME_THRESHOLDS_MS.RECENT) {
    return 'recent';
  } else if (elapsedMs < COARSE_DEFAULT_TIME_THRESHOLDS_MS.LONG_GAP) {
    return 'gap';
  } else {
    return 'long_gap';
  }
}

// ============================================================================
// Pure State Update Helpers
// ============================================================================

/**
 * Applies stat deltas to existing stats with bounds checking.
 *
 * Constraint: stats.md - "Stats are qualitative at heart, even if stored numerically"
 * Constraint: stats.md - "Stats move slowly; no grind loops"
 * Constraint: stats.md - "Single actions should not create large jumps"
 *
 * Stats are bounded (0 minimum, no explicit maximum) to prevent overflow.
 * This function is pure and applies deltas without validation (trust-based).
 */
function applyStatDeltas(
  currentStats: Stats,
  deltas: Partial<Record<StatKey, number>>
): Stats {
  const newStats: Stats = { ...currentStats };

  for (const [key, delta] of Object.entries(deltas) as [StatKey, number][]) {
    // Bounded to prevent negative values; no upper bound (stats can grow naturally)
    // Constraint: stats.md - "Stats reflect patterns of behavior over time"
    newStats[key] = Math.max(0, newStats[key] + delta);
  }

  return newStats;
}

/**
 * Applies flag changes (set and clear) to existing flags.
 *
 * Constraint: quests.md - "Every quest must change something: A flag is set"
 * Constraint: quests.md - "Flags unlock quests"
 *
 * Pure function: creates new Set with flags added/removed.
 */
function applyFlagChanges(
  currentFlags: Flags,
  flagsToSet?: Flag[],
  flagsToClear?: Flag[]
): Flags {
  const newFlags = new Set(currentFlags);

  if (flagsToSet) {
    for (const flag of flagsToSet) {
      newFlags.add(flag);
    }
  }

  if (flagsToClear) {
    for (const flag of flagsToClear) {
      newFlags.delete(flag);
    }
  }

  return newFlags;
}

/**
 * Updates TimeContext with new time range and timestamp.
 *
 * Constraint: time.md - "Time is neutral; stagnation over decay"
 * Constraint: time.md - "Time does not judge. It simply moves forward."
 *
 * Pure function: creates new TimeContext.
 */
function updateTimeContext(
  currentContext: TimeContext,
  newRange: TimeRange,
  nowMs: number,
  lastMeaningfulActionMs?: number
): TimeContext {
  return {
    range: newRange,
    nowMs,
    lastMeaningfulActionMs:
      lastMeaningfulActionMs ?? currentContext.lastMeaningfulActionMs,
  };
}

// ============================================================================
// Main Transition Functions
// ============================================================================

/**
 * Applies quest started transition.
 *
 * Constraint: quests.md - "Quests are lived, not completed"
 * Constraint: quests.md - "Completion is not required; Starting is sufficient" (for Agency)
 * Constraint: time.md - "Track last meaningful action, not last login"
 *
 * Starting a quest is a meaningful action (player has made a decision to act).
 * Updates lastMeaningfulActionMs and emits QuestStartedEvent.
 * Does not apply quest consequences (those happen on completion).
 */
export function applyQuestStarted(
  state: CharacterState,
  questId: QuestId,
  questType: QuestType,
  nowMs: number
): { state: CharacterState; events: EngineEvent[] } {
  // Starting a quest is a meaningful action
  const newRange: TimeRange = 'recent';
  const previousRange = state.timeContext.range;
  const events: EngineEvent[] = [];

  // If time range changed, emit event
  if (previousRange !== newRange) {
    events.push({
      type: 'time_context_changed',
      previousRange,
      newRange,
    });
  }

  const newTimeContext = updateTimeContext(
    state.timeContext,
    newRange,
    nowMs,
    nowMs // Update last meaningful action to now
  );

  const newState: CharacterState = {
    ...state,
    timeContext: newTimeContext,
  };

  events.push({
    type: 'quest_started',
    questId,
    questType,
  });

  return { state: newState, events };
}

/**
 * Applies quest completed transition.
 *
 * Constraint: quests.md - "Every quest must change something: A stat shifts, A flag is set, A future quest unlocks"
 * Constraint: quests.md - "If nothing changes, the quest did not matter"
 * Constraint: stats.md - "Stats reflect patterns of behavior over time, not isolated actions"
 * Constraint: time.md - "Track last meaningful action, not last login"
 *
 * Applies quest.consequence (statChanges, flagsToSet, flagsToClear, unlocksQuests)
 * and emits corresponding events. Updates lastMeaningfulActionMs (completion is meaningful).
 */
export function applyQuestCompleted(
  state: CharacterState,
  quest: QuestNodeWithAvailability,
  nowMs: number
): { state: CharacterState; events: EngineEvent[] } {
  const consequence = quest.consequence;
  const events: EngineEvent[] = [];

  // Apply stat changes
  let newStats = state.stats;
  if (consequence.statChanges && Object.keys(consequence.statChanges).length > 0) {
    newStats = applyStatDeltas(state.stats, consequence.statChanges);
    events.push({
      type: 'stat_changed',
      deltas: consequence.statChanges,
    });
  }

  // Apply flag changes
  let newFlags = state.flags;
  const hasFlagChanges =
    (consequence.flagsToSet && consequence.flagsToSet.length > 0) ||
    (consequence.flagsToClear && consequence.flagsToClear.length > 0);

  if (hasFlagChanges) {
    newFlags = applyFlagChanges(
      state.flags,
      consequence.flagsToSet,
      consequence.flagsToClear
    );

    events.push({
      type: 'flag_changed',
      flagsSet: consequence.flagsToSet,
      flagsCleared: consequence.flagsToClear,
    });
  }

  // Emit quests unlocked event
  if (consequence.unlocksQuests && consequence.unlocksQuests.length > 0) {
    events.push({
      type: 'quests_unlocked',
      questIds: consequence.unlocksQuests,
    });
  }

  // Update time context (completion is meaningful action)
  const newRange: TimeRange = 'recent';
  const previousRange = state.timeContext.range;

  // If time range changed, emit event
  if (previousRange !== newRange) {
    events.push({
      type: 'time_context_changed',
      previousRange,
      newRange,
    });
  }

  const newTimeContext = updateTimeContext(
    state.timeContext,
    newRange,
    nowMs,
    nowMs // Update last meaningful action to now
  );

  // Emit quest completed event (last, as it summarizes the transition)
  events.push({
    type: 'quest_completed',
    questId: quest.id,
    questType: quest.type,
  });

  const newState: CharacterState = {
    ...state,
    stats: newStats,
    flags: newFlags,
    timeContext: newTimeContext,
  };

  return { state: newState, events };
}

/**
 * Applies time tick transition.
 *
 * Constraint: time.md - "Time is neutral; stagnation over decay"
 * Constraint: time.md - "Inactivity is treated as information, not neglect"
 * Constraint: time.md - "Time does not judge. It simply moves forward."
 * Constraint: time.md - "Never surface guilt through language"
 * Constraint: time.md - "Stagnation is the default response to inactivity"
 * Constraint: stats.md - "Stats do not decay rapidly"
 *
 * Computes current TimeRange from lastMeaningfulActionMs and nowMs.
 * Emits TimeContextChangedEvent if range changed.
 * Emits ReEntrySuggestedEvent on long gaps (informational, not punitive).
 * Does NOT modify stats (stagnation, not decay).
 */
export function applyTimeTick(
  state: CharacterState,
  nowMs: number
): { state: CharacterState; events: EngineEvent[] } {
  const newRange = computeTimeRange(
    state.timeContext.lastMeaningfulActionMs,
    nowMs
  );

  const events: EngineEvent[] = [];

  const previousRange = state.timeContext.range;

  // If time range changed, emit event
  if (previousRange !== newRange) {
    events.push({
      type: 'time_context_changed',
      previousRange,
      newRange,
    });
  }

  // Suggest re-entry on gaps (informational, not punitive)
  // Constraint: time.md - "After meaningful absence, offer a single, stabilizing choice"
  // Constraint: time.md - "Re-entry is about returning to agency, not compensating"
  if (newRange === 'gap' || newRange === 'long_gap') {
    // Only emit if we haven't already suggested (check if previous range was also a gap)
    // This prevents spam; re-entry suggestion is informational
    if (previousRange !== 'gap' && previousRange !== 'long_gap') {
      events.push({
        type: 're_entry_suggested',
        currentRange: newRange,
      });
    }
  }

  // Update time context (range may have changed, timestamp always updates)
  // Constraint: time.md - "Stats do not decay rapidly" (we don't touch stats here)
  const newTimeContext = updateTimeContext(
    state.timeContext,
    newRange,
    nowMs,
    state.timeContext.lastMeaningfulActionMs // Don't change last meaningful action
  );

  const newState: CharacterState = {
    ...state,
    timeContext: newTimeContext,
  };

  return { state: newState, events };
}

