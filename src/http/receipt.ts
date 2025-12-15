/**
 * Receipt types for shareable quest completion artifacts.
 */

import type { QuestType } from '../domain/quests';
import type { NarrativeTone } from '../domain/narrative';

/**
 * Receipt: A lightweight, shareable artifact created on quest completion.
 */
export interface Receipt {
  id: string; // UUID
  createdAtMs: number;
  questId: string;
  questType: QuestType;
  tone: NarrativeTone;
  title: string;
  line: string;
  shareText: string; // <= 180 chars, required
}

/**
 * Generates a default shareText for a quest type if narrative.shareText is missing.
 * Identity-based, no stats, no guilt language.
 */
export function generateDefaultShareText(questType: QuestType): string {
  switch (questType) {
    case 'agency':
      return 'Took a step forward. Agency grows through action.';
    case 'courage':
      return 'Spoke a truth. Courage builds through practice.';
    case 'order':
      return 'Removed friction. Order creates space for action.';
  }
}
