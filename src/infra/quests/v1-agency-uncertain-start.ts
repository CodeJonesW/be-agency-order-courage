/**
 * Agency quest: Starting without full clarity.
 *
 * This quest represents initiating action when the path forward is unclear.
 * It is designed to break the pattern of waiting for certainty before beginning.
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
 * v1-agency-uncertain-start: Begin before clarity
 *
 * Constraint: quests.md - "Agency: Initiation without certainty"
 * Constraint: identity_arc.md - "Action is available before certainty"
 * Constraint: quests.md - "Starting is sufficient; Completion is not required"
 * Constraint: stats.md - "Agency increases when you start something you were avoiding"
 * Constraint: stats.md - "Agency increases only when the player begins without full certainty"
 *
 * This quest is available when the player has some agency (agency >= 3) and is not blocked
 * by any flags. It's most relevant during 'recent' time when momentum is building.
 */
export const v1AgencyUncertainStart: QuestNodeWithAvailability = {
  id: 'v1-agency-uncertain-start',
  type: 'agency',
  context:
    'You know there is something you need to start, but the full path is unclear. The details are fuzzy, the outcome uncertain. Yet waiting for clarity is itself a choice—one that keeps you stuck. What is the smallest visible step you can take right now, even if you do not know what comes next?',
  realWorldAction:
    'Take the first visible step on something you have been delaying. Write the first paragraph, make the first call, open the first file, or take the first physical action.',
  constraint:
    'No planning or preparation allowed. You must act within ten minutes of reading this. The action must be concrete and visible—something you can point to and say "I started this".',
  reflection: 'What changed when you took that first step?',
  consequence: {
    statChanges: {
      agency: 1,
    },
    flagsToSet: ['began-without-clarity'],
    unlocksQuests: [],
  },
  availability: {
    stats: {
      minimum: {
        agency: 3,
      },
    },
    flags: {},
    relevance: {
      preferredRanges: ['recent', 'gap'],
    },
  },
};
