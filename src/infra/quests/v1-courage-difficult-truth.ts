/**
 * Courage quest: Speaking a difficult truth.
 *
 * This quest represents facing emotional or social discomfort by saying something
 * that has been avoided. It requires calm delivery under emotional risk.
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
 * v1-courage-difficult-truth: Say what you've been avoiding
 *
 * Constraint: quests.md - "Courage: Facing emotional or social discomfort"
 * Constraint: quests.md - "Emotional risk must be present"
 * Constraint: quests.md - "Calm delivery is required"
 * Constraint: stats.md - "Courage increases when the player engages in avoided conversations"
 * Constraint: stats.md - "Courage is about emotional cost, not physical difficulty"
 *
 * This quest is available when the player has some courage (courage >= 2) and is not blocked.
 * It's most relevant during 'recent' or 'gap' time when relationships need attention.
 */
export const v1CourageDifficultTruth: QuestNodeWithAvailability = {
  id: 'v1-courage-difficult-truth',
  type: 'courage',
  context:
    'There is something you have been meaning to say to someone, but you have been avoiding it. Perhaps it feels too heavy, too vulnerable, or too risky. Yet the silence itself carries a cost. What truth have you been holding back that, if spoken calmly, might change something?',
  realWorldAction:
    'Have one conversation where you say something you have been avoiding. It can be about a boundary, a feeling, a need, or a truth. Choose one person and one thing. Speak it directly, without justification or apology.',
  constraint:
    'You must deliver it calmly and in person (or via voice/video if in person is impossible). No text messages. No long explanations. State the thing clearly, then pause. Do not fill the silence that follows.',
  reflection: 'What shifted when you said it out loud?',
  consequence: {
    statChanges: {
      courage: 1,
    },
    flagsToSet: ['spoke-difficult-truth'],
    unlocksQuests: [],
  },
  availability: {
    stats: {
      minimum: {
        courage: 2,
      },
    },
    flags: {},
    relevance: {
      preferredRanges: ['recent', 'gap'],
    },
  },
};
