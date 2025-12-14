/**
 * Rules unit tests covering quest availability evaluation and selection.
 *
 * All tests are constrained by:
 * - docs/quests.md
 * - docs/time.md
 * - docs/stats.md
 * - docs/ethos.md
 */

import { describe, it, expect } from 'vitest';
import {
  filterAvailableQuests,
  rankQuests,
  chooseQuests,
} from '../src/domain/rules';
import type {
  CharacterState,
  Stats,
  TimeContext,
  TimeRange,
} from '../src/domain/state';
import type {
  QuestNodeWithAvailability,
  QuestType,
  QuestAvailability,
} from '../src/domain/quests';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a minimal valid CharacterState for testing.
 */
function makeState(overrides?: {
  stats?: Partial<Stats>;
  flags?: string[];
  timeContext?: Partial<TimeContext>;
}): CharacterState {
  const baseStats: Stats = {
    agency: 5,
    courage: 3,
    order: 4,
  };

  const baseTimeContext: TimeContext = {
    range: 'recent',
    nowMs: 1000000,
    lastMeaningfulActionMs: 995000,
  };

  return {
    stats: { ...baseStats, ...overrides?.stats },
    flags: new Set(overrides?.flags ?? []),
    timeContext: { ...baseTimeContext, ...overrides?.timeContext ?? {} },
  };
}

/**
 * Creates a quest with custom availability conditions.
 */
function makeQuest(
  id: string,
  type: QuestType,
  availability: QuestAvailability
): QuestNodeWithAvailability {
  return {
    id,
    type,
    context: `Context for ${id}`,
    realWorldAction: `Action for ${id}`,
    constraint: `Constraint for ${id}`,
    consequence: {},
    availability,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('filterAvailableQuests', () => {
  it('excludes quests failing stat minimums', () => {
    // Constraint: quests.md - "Stats gate availability"
    // Constraint: quests.md - "Harder quests unlock through readiness, not grind"
    const state = makeState({ stats: { agency: 5, courage: 3, order: 4 } });

    const quests: QuestNodeWithAvailability[] = [
      makeQuest('quest-1', 'agency', {}), // No requirements - available
      makeQuest('quest-2', 'agency', {
        stats: { minimum: { agency: 4 } }, // Meets requirement (5 >= 4)
      }),
      makeQuest('quest-3', 'agency', {
        stats: { minimum: { agency: 6 } }, // Fails requirement (5 < 6)
      }),
      makeQuest('quest-4', 'courage', {
        stats: { minimum: { courage: 2, agency: 4 } }, // Meets both
      }),
      makeQuest('quest-5', 'courage', {
        stats: { minimum: { courage: 5 } }, // Fails requirement (3 < 5)
      }),
    ];

    const result = filterAvailableQuests(state, quests, 1000000);

    const questIds = result.map((q) => q.id);
    expect(questIds).toContain('quest-1');
    expect(questIds).toContain('quest-2');
    expect(questIds).not.toContain('quest-3'); // Blocked by stat
    expect(questIds).toContain('quest-4');
    expect(questIds).not.toContain('quest-5'); // Blocked by stat
    expect(result.length).toBe(3);
  });

  it('excludes quests with a blocked flag', () => {
    // Constraint: quests.md - "Flags unlock quests"
    // Constraint: quests.md - "Avoidance unlocks different paths"
    const state = makeState({ flags: ['flag-a', 'flag-b'] });

    const quests: QuestNodeWithAvailability[] = [
      makeQuest('quest-1', 'agency', {}), // No requirements - available
      makeQuest('quest-2', 'agency', {
        flags: { required: ['flag-a'] }, // Has required flag
      }),
      makeQuest('quest-3', 'agency', {
        flags: { blocked: ['flag-a'] }, // Has blocked flag - excluded
      }),
      makeQuest('quest-4', 'courage', {
        flags: { blocked: ['flag-c'] }, // Doesn't have blocked flag
      }),
      makeQuest('quest-5', 'order', {
        flags: {
          required: ['flag-a'],
          blocked: ['flag-b'],
        }, // Has required but also blocked - excluded
      }),
    ];

    const result = filterAvailableQuests(state, quests, 1000000);

    const questIds = result.map((q) => q.id);
    expect(questIds).toContain('quest-1');
    expect(questIds).toContain('quest-2');
    expect(questIds).not.toContain('quest-3'); // Blocked by flag
    expect(questIds).toContain('quest-4');
    expect(questIds).not.toContain('quest-5'); // Blocked by flag
    expect(result.length).toBe(3);
  });

  it('requires all required flags to be present', () => {
    // Constraint: quests.md - "Flags unlock quests"
    const state = makeState({ flags: ['flag-a'] });

    const quests: QuestNodeWithAvailability[] = [
      makeQuest('quest-1', 'agency', {
        flags: { required: ['flag-a'] }, // Has required flag
      }),
      makeQuest('quest-2', 'agency', {
        flags: { required: ['flag-a', 'flag-b'] }, // Missing flag-b
      }),
    ];

    const result = filterAvailableQuests(state, quests, 1000000);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('quest-1');
  });
});

describe('rankQuests', () => {
  it('prioritizes quests whose preferredRanges includes state.timeContext.range', () => {
    // Constraint: quests.md - "Time influences relevance"
    // Constraint: time.md - "Time does not judge. It simply moves forward."
    const state = makeState({
      timeContext: { range: 'gap', nowMs: 1000000 },
    });

    const quests: QuestNodeWithAvailability[] = [
      makeQuest('quest-1', 'agency', {}), // No preference
      makeQuest('quest-2', 'agency', {
        relevance: { preferredRanges: ['recent'] }, // Doesn't match
      }),
      makeQuest('quest-3', 'courage', {
        relevance: { preferredRanges: ['gap'] }, // Matches!
      }),
      makeQuest('quest-4', 'order', {
        relevance: { preferredRanges: ['gap', 'long_gap'] }, // Matches!
      }),
      makeQuest('quest-5', 'agency', {}), // No preference
    ];

    const result = rankQuests(state, quests, 1000000);

    // Quests matching 'gap' should come first
    expect(result[0].id).toBe('quest-3'); // gap preference
    expect(result[1].id).toBe('quest-4'); // gap preference
    // Then non-matching quests (preserving original order)
    expect(result[2].id).toBe('quest-1');
    expect(result[3].id).toBe('quest-2');
    expect(result[4].id).toBe('quest-5');
  });

  it('preserves order within matched and unmatched groups', () => {
    const state = makeState({
      timeContext: { range: 'recent', nowMs: 1000000 },
    });

    const quests: QuestNodeWithAvailability[] = [
      makeQuest('quest-a', 'agency', {
        relevance: { preferredRanges: ['recent'] },
      }),
      makeQuest('quest-b', 'courage', {}), // No preference
      makeQuest('quest-c', 'order', {
        relevance: { preferredRanges: ['recent'] },
      }),
      makeQuest('quest-d', 'agency', {}), // No preference
    ];

    const result = rankQuests(state, quests, 1000000);

    // Matched quests first, in original order
    expect(result[0].id).toBe('quest-a');
    expect(result[1].id).toBe('quest-c');
    // Unmatched quests second, in original order
    expect(result[2].id).toBe('quest-b');
    expect(result[3].id).toBe('quest-d');
  });
});

describe('chooseQuests', () => {
  it('returns at most 3 quests', () => {
    // Constraint: quests.md - "Fewer choices are preferred"
    // Constraint: quests.md - "Choice scarcity increases intention"
    const state = makeState();

    const quests: QuestNodeWithAvailability[] = [
      makeQuest('quest-1', 'agency', {}),
      makeQuest('quest-2', 'courage', {}),
      makeQuest('quest-3', 'order', {}),
      makeQuest('quest-4', 'agency', {}),
      makeQuest('quest-5', 'courage', {}),
    ];

    const result = chooseQuests(state, quests, 1000000, 3);

    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('prefers variety across quest types when possible', () => {
    // Constraint: quests.md - "Fewer choices are preferred"
    // Constraint: quests.md - "The 'easiest' quest should never dominate"
    const state = makeState();

    // 6 quests: 3 agency, 2 courage, 1 order
    const quests: QuestNodeWithAvailability[] = [
      makeQuest('quest-a1', 'agency', {}),
      makeQuest('quest-a2', 'agency', {}),
      makeQuest('quest-a3', 'agency', {}),
      makeQuest('quest-c1', 'courage', {}),
      makeQuest('quest-c2', 'courage', {}),
      makeQuest('quest-o1', 'order', {}),
    ];

    const result = chooseQuests(state, quests, 1000000, 3);

    expect(result.length).toBe(3);

    // Should prefer one of each type
    const types = result.map((q) => q.type);
    const uniqueTypes = new Set(types);
    expect(uniqueTypes.size).toBeGreaterThan(1); // At least 2 different types
    expect(uniqueTypes.has('order')).toBe(true); // Order should be included (rarer type)
  });

  it('returns all quests if fewer than maxChoices', () => {
    const state = makeState();

    const quests: QuestNodeWithAvailability[] = [
      makeQuest('quest-1', 'agency', {}),
      makeQuest('quest-2', 'courage', {}),
    ];

    const result = chooseQuests(state, quests, 1000000, 3);

    expect(result.length).toBe(2);
    expect(result.map((q) => q.id)).toEqual(['quest-1', 'quest-2']);
  });

  it('returns empty array if no quests available', () => {
    const state = makeState();

    const result = chooseQuests(state, [], 1000000, 3);

    expect(result).toEqual([]);
  });

  it('filters by availability before selecting', () => {
    // Constraint: quests.md - "Stats gate availability"
    const state = makeState({ stats: { agency: 5, courage: 3, order: 2 } });

    const quests: QuestNodeWithAvailability[] = [
      makeQuest('quest-1', 'agency', {}), // Available
      makeQuest('quest-2', 'agency', {
        stats: { minimum: { agency: 6 } }, // Blocked by stat
      }),
      makeQuest('quest-3', 'courage', {}), // Available
      makeQuest('quest-4', 'order', {
        stats: { minimum: { order: 3 } }, // Blocked by stat
      }),
      makeQuest('quest-5', 'order', {}), // Available
    ];

    const result = chooseQuests(state, quests, 1000000, 3);

    // Should only include available quests
    const questIds = result.map((q) => q.id);
    expect(questIds).toContain('quest-1');
    expect(questIds).not.toContain('quest-2');
    expect(questIds).toContain('quest-3');
    expect(questIds).not.toContain('quest-4');
    expect(questIds).toContain('quest-5');
    expect(result.length).toBe(3); // All 3 available quests selected
  });

  it('ranks by time relevance before selecting', () => {
    // Constraint: quests.md - "Time influences relevance"
    const state = makeState({
      timeContext: { range: 'gap', nowMs: 1000000 },
    });

    const quests: QuestNodeWithAvailability[] = [
      makeQuest('quest-1', 'agency', {}), // No preference
      makeQuest('quest-2', 'agency', {
        relevance: { preferredRanges: ['gap'] }, // Matches!
      }),
      makeQuest('quest-3', 'courage', {}), // No preference
      makeQuest('quest-4', 'order', {
        relevance: { preferredRanges: ['gap'] }, // Matches!
      }),
    ];

    const result = chooseQuests(state, quests, 1000000, 3);

    // Time-matched quests should be selected first
    const questIds = result.map((q) => q.id);
    expect(questIds).toContain('quest-2'); // Has gap preference
    expect(questIds).toContain('quest-4'); // Has gap preference
  });
});

