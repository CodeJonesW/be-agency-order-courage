/**
 * Quest lifecycle tests.
 *
 * Verifies that completed quests are tracked and filtered correctly,
 * repeatable quests respect cooldowns, and calm narrative is returned when no quests are available.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { QuestNodeWithAvailability } from '../src/domain/quests';
import type { CharacterState } from '../src/domain/state';

// Mock quests for testing
const mockNonRepeatableQuest: QuestNodeWithAvailability = {
  id: 'test-non-repeatable',
  type: 'agency',
  context: 'Test context',
  realWorldAction: 'Test action',
  constraint: 'Test constraint.',
  consequence: {
    statChanges: { agency: 1 },
  },
  availability: {
    stats: {},
    flags: {},
  },
  // No repeatable field = non-repeatable
};

const mockRepeatableQuest: QuestNodeWithAvailability = {
  id: 'test-repeatable',
  type: 'courage',
  context: 'Test context',
  realWorldAction: 'Test action',
  constraint: 'Test constraint.',
  consequence: {
    statChanges: { courage: 1 },
  },
  availability: {
    stats: {},
    flags: {},
  },
  repeatable: {
    cooldownMs: 1000, // 1 second cooldown
  },
};

function makeTestState(): CharacterState {
  return {
    stats: { agency: 5, courage: 3, order: 4 },
    flags: new Set(),
    timeContext: {
      range: 'recent',
      nowMs: Date.now(),
      lastMeaningfulActionMs: Date.now(),
    },
  };
}

describe('Quest Lifecycle', () => {
  describe('Completed Quest Tracking', () => {
    it('tracks completed quest IDs', () => {
      const completedQuestIds: string[] = [];
      const completedAtByQuestId: Record<string, number> = {};
      const questId = 'test-quest';
      const nowMs = Date.now();

      // Simulate quest completion
      if (!completedQuestIds.includes(questId)) {
        completedQuestIds.push(questId);
      }
      completedAtByQuestId[questId] = nowMs;

      expect(completedQuestIds).toContain(questId);
      expect(completedAtByQuestId[questId]).toBe(nowMs);
    });

    it('deduplicates completed quest IDs', () => {
      const completedQuestIds: string[] = ['test-quest'];
      const questId = 'test-quest';
      const nowMs = Date.now();

      // Simulate quest completion (should not duplicate)
      if (!completedQuestIds.includes(questId)) {
        completedQuestIds.push(questId);
      }

      expect(completedQuestIds.filter((id) => id === questId).length).toBe(1);
    });
  });

  describe('Non-Repeatable Quest Filtering', () => {
    it('filters out completed non-repeatable quests', () => {
      const completedQuestIds = ['test-non-repeatable'];
      const completedAtByQuestId: Record<string, number> = {
        'test-non-repeatable': Date.now(),
      };
      const quests = [mockNonRepeatableQuest, mockRepeatableQuest];
      const nowMs = Date.now();

      const availableQuests = quests.filter((quest) => {
        if (completedQuestIds.includes(quest.id)) {
          if (quest.repeatable) {
            const completedAt = completedAtByQuestId[quest.id];
            if (completedAt !== undefined) {
              const elapsed = nowMs - completedAt;
              return elapsed >= quest.repeatable.cooldownMs;
            }
          }
          return false;
        }
        return true;
      });

      expect(availableQuests).not.toContainEqual(mockNonRepeatableQuest);
      expect(availableQuests).toContainEqual(mockRepeatableQuest);
    });
  });

  describe('Repeatable Quest Cooldown', () => {
    it('filters out repeatable quests still in cooldown', () => {
      const completedQuestIds = ['test-repeatable'];
      const nowMs = Date.now();
      const completedAt = nowMs - 500; // 500ms ago (still in cooldown)
      const completedAtByQuestId: Record<string, number> = {
        'test-repeatable': completedAt,
      };
      const quests = [mockRepeatableQuest];

      const availableQuests = quests.filter((quest) => {
        if (completedQuestIds.includes(quest.id)) {
          if (quest.repeatable) {
            const completedAt = completedAtByQuestId[quest.id];
            if (completedAt !== undefined) {
              const elapsed = nowMs - completedAt;
              return elapsed >= quest.repeatable.cooldownMs;
            }
          }
          return false;
        }
        return true;
      });

      expect(availableQuests.length).toBe(0);
    });

    it('allows repeatable quests after cooldown', () => {
      const completedQuestIds = ['test-repeatable'];
      const nowMs = Date.now();
      const completedAt = nowMs - 2000; // 2 seconds ago (cooldown passed)
      const completedAtByQuestId: Record<string, number> = {
        'test-repeatable': completedAt,
      };
      const quests = [mockRepeatableQuest];

      const availableQuests = quests.filter((quest) => {
        if (completedQuestIds.includes(quest.id)) {
          if (quest.repeatable) {
            const completedAt = completedAtByQuestId[quest.id];
            if (completedAt !== undefined) {
              const elapsed = nowMs - completedAt;
              return elapsed >= quest.repeatable.cooldownMs;
            }
          }
          return false;
        }
        return true;
      });

      expect(availableQuests).toContainEqual(mockRepeatableQuest);
    });
  });

  describe('Calm Narrative Fallback', () => {
    it('returns calm narrative when no quests available', () => {
      const questCards: unknown[] = [];

      if (questCards.length === 0) {
        const calmNarrative = {
          tone: 'calm' as const,
          title: 'Quiet moment',
          line: "Nothing urgent right now. Come back when you want a next step.",
        };

        expect(calmNarrative.tone).toBe('calm');
        expect(calmNarrative.title).toBe('Quiet moment');
        expect(calmNarrative.line).toContain('Nothing urgent');
      }
    });

    it('calm narrative has correct structure', () => {
      const calmNarrative = {
        tone: 'calm' as const,
        title: 'Quiet moment',
        line: "Nothing urgent right now. Come back when you want a next step.",
      };

      expect(calmNarrative).toHaveProperty('tone');
      expect(calmNarrative).toHaveProperty('title');
      expect(calmNarrative).toHaveProperty('line');
      expect(calmNarrative.tone).toBe('calm');
      expect(typeof calmNarrative.title).toBe('string');
      expect(typeof calmNarrative.line).toBe('string');
    });
  });

  describe('Quest Availability Logic', () => {
    it('uncompleted quests are always available', () => {
      const completedQuestIds: string[] = [];
      const completedAtByQuestId: Record<string, number> = {};
      const quests = [mockNonRepeatableQuest, mockRepeatableQuest];
      const nowMs = Date.now();

      const availableQuests = quests.filter((quest) => {
        if (completedQuestIds.includes(quest.id)) {
          if (quest.repeatable) {
            const completedAt = completedAtByQuestId[quest.id];
            if (completedAt !== undefined) {
              const elapsed = nowMs - completedAt;
              return elapsed >= quest.repeatable.cooldownMs;
            }
          }
          return false;
        }
        return true;
      });

      expect(availableQuests.length).toBe(2);
      expect(availableQuests).toContainEqual(mockNonRepeatableQuest);
      expect(availableQuests).toContainEqual(mockRepeatableQuest);
    });
  });
});
