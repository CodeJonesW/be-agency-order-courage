/**
 * Narrative layer: converts engine events into player-facing summaries.
 *
 * This file provides a pure function that transforms semantic events into
 * minimal, non-judgmental narrative responses.
 *
 * All decisions are constrained by:
 * - docs/ethos.md
 * - docs/time.md
 * - docs/quests.md
 */

import type { EngineEvent } from './events.js';
import type { CharacterState, StatKey } from './state.js';
import type { QuestType } from './quests.js';

/**
 * NarrativeTone: Tone for narrative presentation.
 */
export type NarrativeTone = 'calm' | 'warm' | 'firm';

/**
 * NarrativeSummary: Minimal player-facing narrative response.
 */
export interface NarrativeSummary {
  tone: NarrativeTone;
  title: string; // <= 32 chars
  line: string; // <= 140 chars
  shareText?: string; // <= 180 chars, only for quest_completed
}

/**
 * Summarizes events into a narrative response.
 * Returns null if events are empty.
 *
 * Priority order:
 * 1. quest_completed
 * 2. quest_started
 * 3. re_entry_suggested
 * 4. time_context_changed
 * 5. stat_changed / flag_changed (lowest priority)
 */
export function summarize(
  events: EngineEvent[],
  state: CharacterState
): NarrativeSummary | null {
  if (events.length === 0) {
    return null;
  }

  // Find highest priority event
  const questCompleted = events.find((e) => e.type === 'quest_completed');
  if (questCompleted && questCompleted.type === 'quest_completed') {
    return summarizeQuestCompleted(questCompleted);
  }

  const questStarted = events.find((e) => e.type === 'quest_started');
  if (questStarted && questStarted.type === 'quest_started') {
    return summarizeQuestStarted(questStarted);
  }

  const reEntrySuggested = events.find((e) => e.type === 're_entry_suggested');
  if (reEntrySuggested && reEntrySuggested.type === 're_entry_suggested') {
    return summarizeReEntrySuggested(reEntrySuggested);
  }

  const timeContextChanged = events.find(
    (e) => e.type === 'time_context_changed'
  );
  if (
    timeContextChanged &&
    timeContextChanged.type === 'time_context_changed'
  ) {
    return summarizeTimeContextChanged(timeContextChanged);
  }

  // stat_changed and flag_changed are lowest priority
  // Only surface if no other events exist
  const statChanged = events.find((e) => e.type === 'stat_changed');
  if (statChanged && statChanged.type === 'stat_changed') {
    return summarizeStatChanged(statChanged);
  }

  const flagChanged = events.find((e) => e.type === 'flag_changed');
  if (flagChanged && flagChanged.type === 'flag_changed') {
    return summarizeFlagChanged(flagChanged);
  }

  // Fallback (shouldn't happen, but TypeScript requires it)
  return null;
}

/**
 * Summarizes a quest completed event.
 */
function summarizeQuestCompleted(
  event: Extract<EngineEvent, { type: 'quest_completed' }>
): NarrativeSummary {
  const questTypeLabel = getQuestTypeLabel(event.questType);

  return {
    tone: 'warm',
    title: 'Action completed',
    line: `You took a step. ${questTypeLabel} grows through action, not planning.`,
    shareText: `Completed a ${questTypeLabel} quest. Small steps compound.`,
  };
}

/**
 * Summarizes a quest started event.
 */
function summarizeQuestStarted(
  event: Extract<EngineEvent, { type: 'quest_started' }>
): NarrativeSummary {
  const questTypeLabel = getQuestTypeLabel(event.questType);

  return {
    tone: 'calm',
    title: 'Quest started',
    line: `You began. Starting is enough. The rest will follow.`,
  };
}

/**
 * Summarizes a re-entry suggested event.
 */
function summarizeReEntrySuggested(
  event: Extract<EngineEvent, { type: 're_entry_suggested' }>
): NarrativeSummary {
  return {
    tone: 'calm',
    title: 'Return to action',
    line: `Time away is information, not judgment. A small step awaits when you're ready.`,
  };
}

/**
 * Summarizes a time context changed event.
 */
function summarizeTimeContextChanged(
  event: Extract<EngineEvent, { type: 'time_context_changed' }>
): NarrativeSummary {
  if (event.newRange === 'recent') {
    return {
      tone: 'calm',
      title: 'Momentum building',
      line: `Recent action shifts context. The path forward feels clearer.`,
    };
  }

  if (event.newRange === 'gap' || event.newRange === 'long_gap') {
    return {
      tone: 'calm',
      title: 'Time passed',
      line: `Context shifted. When you return, a small step will be waiting.`,
    };
  }

  // Fallback
  return {
    tone: 'calm',
    title: 'Context changed',
    line: `Time moves forward. Your next step remains available.`,
  };
}

/**
 * Summarizes a stat changed event.
 */
function summarizeStatChanged(
  event: Extract<EngineEvent, { type: 'stat_changed' }>
): NarrativeSummary {
  const statLabels = Object.keys(event.deltas)
    .map((key) => getStatLabel(key as StatKey))
    .join(' and ');

  return {
    tone: 'warm',
    title: 'Growth noticed',
    line: `${statLabels} shifts through action. Patterns emerge over time.`,
  };
}

/**
 * Summarizes a flag changed event.
 */
function summarizeFlagChanged(
  event: Extract<EngineEvent, { type: 'flag_changed' }>
): NarrativeSummary {
  if (event.flagsSet && event.flagsSet.length > 0) {
    return {
      tone: 'calm',
      title: 'Path opened',
      line: `Your choices shape what becomes available next.`,
    };
  }

  return {
    tone: 'calm',
    title: 'State updated',
    line: `Something shifted. The path forward adjusts.`,
  };
}

/**
 * Gets a human-readable label for a quest type.
 */
function getQuestTypeLabel(questType: QuestType): string {
  switch (questType) {
    case 'agency':
      return 'Agency';
    case 'courage':
      return 'Courage';
    case 'order':
      return 'Order';
  }
}

/**
 * Gets a human-readable label for a stat.
 */
function getStatLabel(stat: StatKey): string {
  switch (stat) {
    case 'agency':
      return 'Agency';
    case 'courage':
      return 'Courage';
    case 'order':
      return 'Order';
  }
}
