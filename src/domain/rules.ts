/**
 * Quest availability evaluation and selection rules.
 *
 * This file implements pure functions for evaluating quest availability
 * and selecting a small set of quests based on state and constraints.
 *
 * All decisions in this file are constrained by:
 * - docs/quests.md
 * - docs/time.md
 * - docs/stats.md
 * - docs/identity_arc.md
 * - docs/ethos.md
 *
 * Non-goals (not included):
 * - Quest graph traversal
 * - Persistence
 * - Engine orchestration
 */

import type { CharacterState, StatKey } from './state.js';
import type {
  QuestNodeWithAvailability,
  QuestType,
  StatRequirement,
  FlagRequirement,
} from './quests.js';

// ============================================================================
// Availability Evaluation
// ============================================================================

/**
 * Checks if stat requirements are satisfied.
 *
 * Constraint: quests.md - "Stats gate availability"
 * Constraint: quests.md - "Harder quests unlock through readiness, not grind"
 * Constraint: identity_arc.md - "Avoidance does not reduce stats" (gating is one-way)
 *
 * All minimum stat requirements must be met for availability.
 */
function meetsStatRequirements(
  state: CharacterState,
  statReq: StatRequirement
): boolean {
  if (!statReq.minimum) {
    return true; // No requirements = always meets
  }

  for (const [statKey, minimumValue] of Object.entries(
    statReq.minimum
  ) as [StatKey, number][]) {
    if (state.stats[statKey] < minimumValue) {
      return false; // Any stat below minimum blocks availability
    }
  }

  return true;
}

/**
 * Checks if flag requirements are satisfied.
 *
 * Constraint: quests.md - "Flags unlock quests"
 * Constraint: quests.md - "Avoidance unlocks different paths" (flags track paths)
 *
 * All required flags must be present; any blocked flag prevents availability.
 */
function meetsFlagRequirements(
  state: CharacterState,
  flagReq: FlagRequirement
): boolean {
  // Check required flags (all must exist)
  if (flagReq.required && flagReq.required.length > 0) {
    for (const flag of flagReq.required) {
      if (!state.flags.has(flag)) {
        return false; // Missing required flag blocks availability
      }
    }
  }

  // Check blocked flags (any blocks)
  if (flagReq.blocked && flagReq.blocked.length > 0) {
    for (const flag of flagReq.blocked) {
      if (state.flags.has(flag)) {
        return false; // Any blocked flag prevents availability
      }
    }
  }

  return true;
}

/**
 * Evaluates if a quest is available given the current state.
 *
 * Constraint: quests.md - "Stats gate availability"
 * Constraint: quests.md - "Flags unlock quests"
 * Constraint: quests.md - "Time influences relevance" (but relevance is a hint, not a gate)
 * Constraint: quests.md - "Not all quests are visible at once"
 *
 * Checks stat minimums, required flags, and blocked flags.
 * Time relevance is NOT used for availability (it's only for ranking).
 *
 * All conditions must be satisfied for a quest to be available.
 */
export function isQuestAvailable(
  state: CharacterState,
  quest: QuestNodeWithAvailability,
  _nowMs: number
): boolean {
  const availability = quest.availability;

  // Check stat requirements
  if (availability.stats) {
    if (!meetsStatRequirements(state, availability.stats)) {
      return false;
    }
  }

  // Check flag requirements
  if (availability.flags) {
    if (!meetsFlagRequirements(state, availability.flags)) {
      return false;
    }
  }

  // Time relevance is a hint for ranking, not a hard gate for availability
  // Constraint: quests.md - "Time influences relevance" (hint, not gate)

  return true;
}

// ============================================================================
// Quest Filtering
// ============================================================================

/**
 * Filters quests to only those that are available given the current state.
 *
 * Constraint: quests.md - "Stats gate availability"
 * Constraint: quests.md - "Flags unlock quests"
 * Constraint: quests.md - "Not all quests are visible at once"
 *
 * Returns only quests that meet all availability requirements (stats, flags).
 * Time relevance is not used for filtering (only for ranking).
 */
export function filterAvailableQuests(
  state: CharacterState,
  quests: QuestNodeWithAvailability[],
  nowMs: number
): QuestNodeWithAvailability[] {
  return quests.filter((quest) => isQuestAvailable(state, quest, nowMs));
}

// ============================================================================
// Quest Ranking
// ============================================================================

/**
 * Ranks quests by relevance, prioritizing time-matched quests.
 *
 * Constraint: quests.md - "Time influences relevance"
 * Constraint: quests.md - "The 'easiest' quest should never dominate"
 * Constraint: time.md - "Time does not judge. It simply moves forward."
 *
 * Quests matching the current time range are ranked higher.
 * Within each group, original order is preserved (stable sort).
 * Time relevance is a hint, not a punishment.
 */
export function rankQuests(
  state: CharacterState,
  quests: QuestNodeWithAvailability[],
  _nowMs: number
): QuestNodeWithAvailability[] {
  const currentRange = state.timeContext.range;

  // Separate quests into time-matched and non-matched
  const matched: QuestNodeWithAvailability[] = [];
  const unmatched: QuestNodeWithAvailability[] = [];

  for (const quest of quests) {
    const preferredRanges =
      quest.availability.relevance?.preferredRanges ?? [];

    if (preferredRanges.length > 0 && preferredRanges.includes(currentRange)) {
      matched.push(quest);
    } else {
      unmatched.push(quest);
    }
  }

  // Return matched first, then unmatched (preserving order within each group)
  return [...matched, ...unmatched];
}

// ============================================================================
// Quest Selection
// ============================================================================

/**
 * Selects a small set of quest choices, preferring variety across quest types.
 *
 * Constraint: quests.md - "Fewer choices are preferred"
 * Constraint: quests.md - "Choice scarcity increases intention"
 * Constraint: quests.md - "Not all quests are visible at once"
 * Constraint: quests.md - "The 'easiest' quest should never dominate"
 * Constraint: time.md - "Re-entry is about returning to agency" (variety matters)
 *
 * Returns at most maxChoices quests, preferring variety across QuestType
 * to avoid presenting all quests of the same type.
 */
export function selectQuestChoices(
  _state: CharacterState,
  quests: QuestNodeWithAvailability[],
  _nowMs: number,
  maxChoices = 3
): QuestNodeWithAvailability[] {
  if (quests.length === 0) {
    return [];
  }

  if (quests.length <= maxChoices) {
    // If we have fewer or equal quests than max, return all (already ranked)
    return quests;
  }

  // Prefer variety across quest types
  // Constraint: quests.md - "Fewer choices are preferred" (variety increases value)
  const selected: QuestNodeWithAvailability[] = [];
  const usedTypes = new Set<QuestType>();

  // First pass: try to get one of each type
  for (const quest of quests) {
    if (selected.length >= maxChoices) {
      break;
    }

    if (!usedTypes.has(quest.type)) {
      selected.push(quest);
      usedTypes.add(quest.type);
    }
  }

  // Second pass: fill remaining slots (can include duplicates if needed)
  for (const quest of quests) {
    if (selected.length >= maxChoices) {
      break;
    }

    if (!selected.includes(quest)) {
      selected.push(quest);
    }
  }

  return selected;
}

// ============================================================================
// Quest Selection Pipeline
// ============================================================================

/**
 * Complete quest selection pipeline: filter → rank → select.
 *
 * Constraint: quests.md - "Fewer choices are preferred"
 * Constraint: quests.md - "Choice scarcity increases intention"
 * Constraint: quests.md - "Not all quests are visible at once"
 *
 * Performs the full pipeline:
 * 1. Filters to available quests (stats/flags)
 * 2. Ranks by time relevance
 * 3. Selects final choices (maxChoices, preferring variety)
 *
 * This is the recommended entry point to avoid forgetting steps.
 */
export function chooseQuests(
  state: CharacterState,
  quests: QuestNodeWithAvailability[],
  nowMs: number,
  maxChoices = 3
): QuestNodeWithAvailability[] {
  const available = filterAvailableQuests(state, quests, nowMs);
  const ranked = rankQuests(state, available, nowMs);
  return selectQuestChoices(state, ranked, nowMs, maxChoices);
}

