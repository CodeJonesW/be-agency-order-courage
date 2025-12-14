/**
 * Order quest: Removing one obstacle.
 *
 * This quest represents reducing friction for future action by addressing
 * a single, concrete barrier that makes initiation harder.
 *
 * All design decisions are constrained by:
 * - docs/ethos.md
 * - docs/identity_arc.md
 * - docs/quests.md
 * - docs/time.md
 * - docs/stats.md
 */

import type { QuestNodeWithAvailability } from '../../domain/quests.js';

/**
 * v1-order-remove-friction: Clear one obstacle
 *
 * Constraint: quests.md - "Order: Reduce friction for future action"
 * Constraint: quests.md - "Must directly lower future resistance"
 * Constraint: quests.md - "Must be small and concrete"
 * Constraint: quests.md - "Must connect to an upcoming Agency quest"
 * Constraint: stats.md - "Order increases when the player removes physical or digital friction"
 * Constraint: stats.md - "Order must directly reduce future friction"
 *
 * This quest is available when the player has some order (order >= 2) and is not blocked.
 * It's most relevant during 'recent' time when preparing for future action, or during 'gap'
 * when re-establishing systems.
 */
export const v1OrderRemoveFriction: QuestNodeWithAvailability = {
  id: 'v1-order-remove-friction',
  type: 'order',
  context:
    'There is something you keep meaning to do, but something small stands in the way. A missing tool, a cluttered space, a broken process, or a forgotten step. This small friction makes the larger action feel heavier than it is. What is one concrete obstacle you can remove right now?',
  realWorldAction:
    'Identify and remove one specific barrier that makes a future action harder. Clear a space, fix a tool, organize a drawer, set up one system, or remove one digital friction. Make it concrete and small—under thirty minutes.',
  constraint:
    'It must directly connect to something you have been avoiding or delaying. The removal must make the next step visibly easier. No aesthetic improvements without functional impact.',
  reflection: 'How does removing that obstacle change what feels possible?',
  consequence: {
    statChanges: {
      order: 1,
    },
    flagsToSet: ['removed-friction'],
    unlocksQuests: [],
  },
  availability: {
    stats: {
      minimum: {
        order: 2,
      },
    },
    flags: {},
    relevance: {
      preferredRanges: ['recent', 'gap'],
    },
  },
};
