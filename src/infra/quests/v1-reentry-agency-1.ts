/**
 * First Agency quest for re-entry after a long gap.
 *
 * This quest represents the initial meaningful action a player takes after absence.
 * It is designed to break inertia and re-establish agency without pressure.
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
 * v1-reentry-agency-1: Return to action
 *
 * Constraint: quests.md - "Agency: Initiation without certainty"
 * Constraint: time.md - "Re-entry is about returning to agency, not compensating for time lost"
 * Constraint: time.md - "Small, Grounded, Order- or Courage-focused" (Agency supports this)
 * Constraint: quests.md - "Starting is sufficient; Completion is not required"
 * Constraint: stats.md - "Agency increases when you start something you were avoiding"
 *
 * This quest is available after gaps (gap or long_gap) and is blocked once completed
 * (via "returned-to-action" flag) to prevent repetition.
 */
export const v1ReentryAgency1: QuestNodeWithAvailability = {
  id: 'v1-reentry-agency-1',
  type: 'agency',
  context:
    'Time away can make the first action feel heavier than it is. But action does not require readiness—it only requires starting. Who have you been meaning to contact but putting off?',
  realWorldAction:
    'Send one message to someone you have been meaning to reach out to. It can be brief. It can be imperfect. It just needs to be sent.',
  constraint:
    'No drafting or rewriting. Write it and send it within five minutes, even if it feels incomplete.',
  reflection: 'What changed when you pressed send?',
  consequence: {
    statChanges: {
      agency: 1,
    },
    flagsToSet: ['returned-to-action'],
    unlocksQuests: [],
  },
  availability: {
    stats: {},
    flags: {
      blocked: ['returned-to-action'],
    },
    relevance: {
      preferredRanges: ['gap', 'long_gap'],
    },
  },
};

