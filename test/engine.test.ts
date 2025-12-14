/**
 * Engine unit tests covering core behavior and non-negotiable constraints.
 *
 * Requires vitest setup.
 *
 * All tests are constrained by:
 * - docs/ethos.md
 * - docs/identity_arc.md
 * - docs/stats.md
 * - docs/quests.md
 * - docs/time.md
 */

import { describe, it, expect } from 'vitest';
import { tick, startQuest, completeQuest } from '../src/domain/engine';
import type { QuestCatalog } from '../src/domain/engine';
import type {
  CharacterState,
  Stats,
  TimeContext,
  Flags,
} from '../src/domain/state';
import type {
  QuestId,
  QuestNodeWithAvailability,
  QuestType,
} from '../src/domain/quests';
import type { EngineEvent } from '../src/domain/events';

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
    lastMeaningfulActionMs: 995000, // 5 seconds ago (recent)
  };

  return {
    stats: { ...baseStats, ...overrides?.stats },
    flags: new Set(overrides?.flags ?? []),
    timeContext: { ...baseTimeContext, ...overrides?.timeContext ?? {} },
  };
}

/**
 * Minimal in-memory QuestCatalog implementation for testing.
 */
class TestQuestCatalog implements QuestCatalog {
  private quests: Map<QuestId, QuestNodeWithAvailability>;

  constructor(quests: QuestNodeWithAvailability[] = []) {
    this.quests = new Map(quests.map((q) => [q.id, q]));
  }

  getQuestById(id: QuestId): QuestNodeWithAvailability | undefined {
    return this.quests.get(id);
  }

  listAll(): QuestNodeWithAvailability[] {
    return Array.from(this.quests.values());
  }
}

/**
 * Creates a minimal quest for testing.
 */
function makeQuest(
  id: QuestId,
  type: QuestType,
  consequence?: QuestNodeWithAvailability['consequence']
): QuestNodeWithAvailability {
  return {
    id,
    type,
    context: `Context for ${id}`,
    realWorldAction: `Action for ${id}`,
    constraint: `Constraint for ${id}`,
    consequence: consequence ?? {},
    availability: {},
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('tick()', () => {
  it('does not modify stats', () => {
    // Constraint: stats.md - "Stats do not decay rapidly"
    // Constraint: time.md - "Stagnation is the default response to inactivity"
    const state = makeState({ stats: { agency: 10, courage: 5, order: 7 } });
    const nowMs = 1005000; // 5 seconds later (still recent)

    const result = tick(state, nowMs);

    expect(result.state.stats).toEqual(state.stats);
    expect(result.state.stats.agency).toBe(10);
    expect(result.state.stats.courage).toBe(5);
    expect(result.state.stats.order).toBe(7);
  });

  it('can emit time_context_changed when range changes', () => {
    // Constraint: time.md - "Time is neutral; stagnation over decay"
    const state = makeState({
      timeContext: {
        range: 'recent',
        nowMs: 1000000,
        lastMeaningfulActionMs: 995000, // 5 seconds ago
      },
    });
    // Advance time to create a gap (more than 2 days)
    const nowMs = 1000000 + 3 * 24 * 60 * 60 * 1000; // ~3 days later

    const result = tick(state, nowMs);

    expect(result.state.timeContext.range).toBe('gap');
    const timeContextChanged = result.events.find(
      (e) => e.type === 'time_context_changed'
    );
    expect(timeContextChanged).toBeDefined();
    if (timeContextChanged && timeContextChanged.type === 'time_context_changed') {
      expect(timeContextChanged.previousRange).toBe('recent');
      expect(timeContextChanged.newRange).toBe('gap');
    }
  });

  it('can emit re_entry_suggested on gap/long_gap transition (no punishment)', () => {
    // Constraint: time.md - "Re-entry is about returning to agency, not compensating"
    // Constraint: time.md - "Never surface guilt through language"
    const state = makeState({
      timeContext: {
        range: 'recent',
        nowMs: 1000000,
        lastMeaningfulActionMs: 995000,
      },
    });
    // Advance time to create a long gap (more than 7 days)
    const nowMs = 1000000 + 8 * 24 * 60 * 60 * 1000; // ~8 days later

    const result = tick(state, nowMs);

    expect(result.state.timeContext.range).toBe('long_gap');
    const reEntrySuggested = result.events.find(
      (e) => e.type === 're_entry_suggested'
    );
    expect(reEntrySuggested).toBeDefined();
    if (reEntrySuggested && reEntrySuggested.type === 're_entry_suggested') {
      expect(reEntrySuggested.currentRange).toBe('long_gap');
      // Verify this is informational, not punitive (no negative stat changes)
      expect(result.state.stats).toEqual(state.stats);
    }
  });
});

describe('startQuest()', () => {
  it('updates time context to recent and lastMeaningfulActionMs to now', () => {
    // Constraint: time.md - "Track last meaningful action, not last login"
    const state = makeState({
      timeContext: {
        range: 'gap',
        nowMs: 1000000,
        lastMeaningfulActionMs: 500000, // Old action
      },
    });
    const quest = makeQuest('quest-1', 'agency');
    const catalog = new TestQuestCatalog([quest]);
    const nowMs = 1005000;

    const result = startQuest(state, 'quest-1', catalog, nowMs);

    expect(result.state.timeContext.range).toBe('recent');
    expect(result.state.timeContext.lastMeaningfulActionMs).toBe(nowMs);
    expect(result.state.timeContext.nowMs).toBe(nowMs);
  });

  it('emits quest_started', () => {
    const state = makeState();
    const quest = makeQuest('quest-1', 'courage');
    const catalog = new TestQuestCatalog([quest]);
    const nowMs = 1005000;

    const result = startQuest(state, 'quest-1', catalog, nowMs);

    const questStarted = result.events.find((e) => e.type === 'quest_started');
    expect(questStarted).toBeDefined();
    if (questStarted && questStarted.type === 'quest_started') {
      expect(questStarted.questId).toBe('quest-1');
      expect(questStarted.questType).toBe('courage');
    }
  });

  it('returns unchanged state and no events when quest not found', () => {
    // Constraint: ethos.md - "The system does not command. It does not beg. It does not manipulate."
    const state = makeState();
    const catalog = new TestQuestCatalog([]); // Empty catalog
    const nowMs = 1005000;

    const result = startQuest(state, 'missing-quest', catalog, nowMs);

    expect(result.state).toEqual(state);
    expect(result.events).toEqual([]);
  });
});

describe('completeQuest()', () => {
  it('applies stat_changed deltas (bounded at 0)', () => {
    // Constraint: stats.md - "Stats are qualitative at heart, even if stored numerically"
    const state = makeState({ stats: { agency: 5, courage: 2, order: 3 } });
    const quest = makeQuest('quest-1', 'agency', {
      statChanges: {
        agency: 2, // Increase agency by 2
        courage: -5, // Try to decrease courage below 0 (should be bounded)
      },
    });
    const catalog = new TestQuestCatalog([quest]);
    const nowMs = 1005000;

    const result = completeQuest(state, 'quest-1', catalog, nowMs);

    expect(result.state.stats.agency).toBe(7); // 5 + 2
    expect(result.state.stats.courage).toBe(0); // Bounded at 0, not negative
    expect(result.state.stats.order).toBe(3); // Unchanged

    const statChanged = result.events.find((e) => e.type === 'stat_changed');
    expect(statChanged).toBeDefined();
  });

  it('sets/clears flags', () => {
    // Constraint: quests.md - "Every quest must change something: A flag is set"
    const state = makeState({ flags: ['flag-a', 'flag-b'] });
    const quest = makeQuest('quest-1', 'order', {
      flagsToSet: ['flag-c', 'flag-d'],
      flagsToClear: ['flag-a'],
    });
    const catalog = new TestQuestCatalog([quest]);
    const nowMs = 1005000;

    const result = completeQuest(state, 'quest-1', catalog, nowMs);

    expect(result.state.flags.has('flag-a')).toBe(false); // Cleared
    expect(result.state.flags.has('flag-b')).toBe(true); // Kept
    expect(result.state.flags.has('flag-c')).toBe(true); // Set
    expect(result.state.flags.has('flag-d')).toBe(true); // Set

    const flagChanged = result.events.find((e) => e.type === 'flag_changed');
    expect(flagChanged).toBeDefined();
    if (flagChanged && flagChanged.type === 'flag_changed') {
      expect(flagChanged.flagsSet).toContain('flag-c');
      expect(flagChanged.flagsSet).toContain('flag-d');
      expect(flagChanged.flagsCleared).toContain('flag-a');
    }
  });

  it('emits quest_completed', () => {
    const state = makeState();
    const quest = makeQuest('quest-1', 'agency');
    const catalog = new TestQuestCatalog([quest]);
    const nowMs = 1005000;

    const result = completeQuest(state, 'quest-1', catalog, nowMs);

    const questCompleted = result.events.find(
      (e) => e.type === 'quest_completed'
    );
    expect(questCompleted).toBeDefined();
    if (questCompleted && questCompleted.type === 'quest_completed') {
      expect(questCompleted.questId).toBe('quest-1');
      expect(questCompleted.questType).toBe('agency');
    }
  });

  it('returns unchanged state and no events when quest not found', () => {
    // Constraint: ethos.md - "The system does not command. It does not beg. It does not manipulate."
    const state = makeState();
    const catalog = new TestQuestCatalog([]);
    const nowMs = 1005000;

    const result = completeQuest(state, 'missing-quest', catalog, nowMs);

    expect(result.state).toEqual(state);
    expect(result.events).toEqual([]);
  });
});

describe('No grind / no punishment invariants', () => {
  it('tick() never decreases stats', () => {
    // Constraint: stats.md - "Stats do not decay rapidly"
    // Constraint: time.md - "Stagnation is the default response to inactivity"
    const state = makeState({ stats: { agency: 10, courage: 5, order: 7 } });
    // Advance time significantly (long gap)
    const nowMs = 1000000 + 30 * 24 * 60 * 60 * 1000; // ~30 days later

    const result = tick(state, nowMs);

    expect(result.state.stats.agency).toBeGreaterThanOrEqual(state.stats.agency);
    expect(result.state.stats.courage).toBeGreaterThanOrEqual(
      state.stats.courage
    );
    expect(result.state.stats.order).toBeGreaterThanOrEqual(state.stats.order);
    // Stats should be exactly the same (no decay)
    expect(result.state.stats).toEqual(state.stats);
  });

  it('missing questId returns unchanged state and no events (startQuest)', () => {
    // Constraint: ethos.md - "The system does not command. It does not beg. It does not manipulate."
    const state = makeState();
    const catalog = new TestQuestCatalog([]);
    const nowMs = 1005000;

    const result = startQuest(state, 'missing', catalog, nowMs);

    expect(result.state).toEqual(state);
    expect(result.events).toEqual([]);
  });

  it('missing questId returns unchanged state and no events (completeQuest)', () => {
    // Constraint: ethos.md - "The system does not command. It does not beg. It does not manipulate."
    const state = makeState();
    const catalog = new TestQuestCatalog([]);
    const nowMs = 1005000;

    const result = completeQuest(state, 'missing', catalog, nowMs);

    expect(result.state).toEqual(state);
    expect(result.events).toEqual([]);
  });
});

