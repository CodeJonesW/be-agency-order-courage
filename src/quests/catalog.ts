/**
 * Minimal quest catalog implementation.
 *
 * Provides quest lookup and enumeration for the engine.
 * This is a dumb catalog: no availability logic, no traversal, no side effects.
 */

import type { QuestCatalog } from '../domain/engine.js';
import type { QuestId, QuestNodeWithAvailability } from '../domain/quests.js';
import { v1ReentryAgency1 } from '../infra/quests/v1-reentry-agency-1.js';

/**
 * In-memory quest catalog containing all available quests.
 */
const quests = new Map<QuestId, QuestNodeWithAvailability>([
  [v1ReentryAgency1.id, v1ReentryAgency1],
]);

/**
 * Quest catalog implementation.
 *
 * Provides stable, in-memory quest storage with simple lookup and enumeration.
 */
export const catalog: QuestCatalog = {
  getQuestById(id: QuestId) {
    return quests.get(id);
  },

  listAll() {
    // Return in stable order (insertion order for Map values)
    return Array.from(quests.values());
  },
};

