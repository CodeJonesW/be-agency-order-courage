/**
 * Life Engine: Orchestration layer for state transitions and quest operations.
 *
 * This file provides the engine interface that coordinates pure transitions
 * with quest catalog lookups. It does not implement quest availability logic
 * (that belongs in rules.ts).
 *
 * All decisions in this file are constrained by:
 * - docs/ethos.md
 * - docs/identity_arc.md
 * - docs/stats.md
 * - docs/quests.md
 * - docs/time.md
 *
 * Non-goals (not included):
 * - Quest availability evaluation (belongs in rules.ts)
 * - Quest graph traversal logic
 * - Persistence or storage
 * - HTTP routes
 * - Analytics or logging
 */

import type { CharacterState } from './state.js';
import type {
  QuestId,
  QuestNodeWithAvailability,
} from './quests.js';
import type { EngineEvent } from './events.js';
import {
  applyTimeTick,
  applyQuestStarted,
  applyQuestCompleted,
} from './transitions.js';
import { chooseQuests } from './rules.js';

// ============================================================================
// Quest Catalog Interface
// ============================================================================

/**
 * QuestCatalog: Interface for quest lookup and enumeration.
 *
 * Constraint: quests.md - "Quests exist in a graph, not a flat list"
 *
 * Provides quest lookup without exposing graph traversal or availability logic.
 * The catalog is injected as a dependency to keep the engine testable and pure.
 */
export interface QuestCatalog {
  /**
   * Gets a quest by ID, or undefined if not found.
   *
   * Constraint: quests.md - "Quests exist in a graph"
   */
  getQuestById(id: QuestId): QuestNodeWithAvailability | undefined;

  /**
   * Lists all quests in the catalog (for testing/debugging).
   *
   * Constraint: quests.md - "Agents must never present quests as a flat list"
   * This is for enumeration only, not for availability evaluation.
   */
  listAll?(): QuestNodeWithAvailability[];
}

// ============================================================================
// Engine Functions
// ============================================================================

/**
 * Ticks the engine forward in time.
 *
 * Constraint: time.md - "Time is neutral; stagnation over decay"
 * Constraint: time.md - "Time does not judge. It simply moves forward."
 *
 * Applies time drift, computes TimeRange, and emits time-related events.
 * Does not modify stats (stagnation over decay).
 */
export function tick(
  state: CharacterState,
  nowMs: number
): { state: CharacterState; events: EngineEvent[] } {
  return applyTimeTick(state, nowMs);
}

/**
 * Starts a quest (initiates a meaningful action).
 *
 * Constraint: quests.md - "Quests are lived, not completed"
 * Constraint: quests.md - "Completion is not required; Starting is sufficient" (for Agency)
 * Constraint: time.md - "Track last meaningful action, not last login"
 *
 * Looks up the quest from the catalog and applies the quest started transition.
 * Starting a quest updates lastMeaningfulActionMs and emits QuestStartedEvent.
 */
export function startQuest(
  state: CharacterState,
  questId: QuestId,
  catalog: QuestCatalog,
  nowMs: number
): { state: CharacterState; events: EngineEvent[] } {
  const quest = catalog.getQuestById(questId);
  if (!quest) {
    // Quest not found - return state unchanged, emit no events
    // Constraint: ethos.md - "The system does not command. It does not beg. It does not manipulate."
    // Failure to find quest is handled gracefully without error
    return { state, events: [] };
  }

  return applyQuestStarted(state, questId, quest.type, nowMs);
}

/**
 * Completes a quest (applies quest consequences).
 *
 * Constraint: quests.md - "Every quest must change something: A stat shifts, A flag is set, A future quest unlocks"
 * Constraint: quests.md - "If nothing changes, the quest did not matter"
 * Constraint: stats.md - "Stats reflect patterns of behavior over time, not isolated actions"
 * Constraint: time.md - "Track last meaningful action, not last login"
 *
 * Looks up the quest from the catalog and applies quest consequences.
 * Applies stat changes, flag updates, unlocks quests, and emits corresponding events.
 */
export function completeQuest(
  state: CharacterState,
  questId: QuestId,
  catalog: QuestCatalog,
  nowMs: number
): { state: CharacterState; events: EngineEvent[] } {
  const quest = catalog.getQuestById(questId);
  if (!quest) {
    // Quest not found - return state unchanged, emit no events
    // Constraint: ethos.md - "The system does not command. It does not beg. It does not manipulate."
    // Failure to find quest is handled gracefully without error
    return { state, events: [] };
  }

  return applyQuestCompleted(state, quest, nowMs);
}

/**
 * Gets available quests for the current state.
 *
 * Constraint: quests.md - "Not all quests are visible at once"
 * Constraint: quests.md - "Stats gate availability"
 * Constraint: quests.md - "Flags unlock quests"
 * Constraint: quests.md - "Time influences relevance"
 * Constraint: quests.md - "Fewer choices are preferred"
 * Constraint: quests.md - "Choice scarcity increases intention"
 *
 * Enumerates all quests from the catalog and applies the full selection pipeline:
 * filters by availability (stats/flags), ranks by time relevance, and selects
 * a small set of choices (max 3) with variety across quest types.
 */
export function getAvailableQuests(
  state: CharacterState,
  catalog: QuestCatalog,
  nowMs: number
): QuestNodeWithAvailability[] {
  // Enumerate quests from catalog
  const allQuests = catalog.listAll?.() ?? [];

  // If no quests or listAll not available, return empty array
  if (allQuests.length === 0) {
    return [];
  }

  // Apply full selection pipeline: filter → rank → select
  // Constraint: quests.md - "Fewer choices are preferred" (max 3)
  return chooseQuests(state, allQuests, nowMs, 3);
}

