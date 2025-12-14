/**
 * Narrative layer unit tests.
 *
 * Verifies that narrative summaries are generated correctly and avoid
 * guilt language while maintaining proper priority ordering.
 */

import { describe, it, expect } from 'vitest';
import { summarize } from '../src/domain/narrative';
import type { EngineEvent } from '../src/domain/events';
import type { CharacterState } from '../src/domain/state';

// ============================================================================
// Test Helpers
// ============================================================================

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

// ============================================================================
// Tests
// ============================================================================

describe('narrative.summarize', () => {
  it('returns null for empty events', () => {
    const state = makeTestState();
    const result = summarize([], state);
    expect(result).toBeNull();
  });

  it('returns a summary for quest_completed', () => {
    const state = makeTestState();
    const events: EngineEvent[] = [
      {
        type: 'quest_completed',
        questId: 'test-quest',
        questType: 'agency',
      },
    ];

    const result = summarize(events, state);

    expect(result).not.toBeNull();
    expect(result?.tone).toBe('warm');
    expect(result?.title).toBe('Action completed');
    expect(result?.line).toContain('Agency');
    expect(result?.shareText).toBeDefined();
    expect(result?.shareText?.length).toBeLessThanOrEqual(180);
  });

  it('quest_completed summary includes shareText', () => {
    const state = makeTestState();
    const events: EngineEvent[] = [
      {
        type: 'quest_completed',
        questId: 'test-quest',
        questType: 'courage',
      },
    ];

    const result = summarize(events, state);

    expect(result?.shareText).toBeDefined();
    expect(result?.shareText).toContain('Courage');
  });

  it('quest_started does not include shareText', () => {
    const state = makeTestState();
    const events: EngineEvent[] = [
      {
        type: 'quest_started',
        questId: 'test-quest',
        questType: 'agency',
      },
    ];

    const result = summarize(events, state);

    expect(result).not.toBeNull();
    expect(result?.shareText).toBeUndefined();
  });

  it('prioritizes quest_completed over quest_started', () => {
    const state = makeTestState();
    const events: EngineEvent[] = [
      {
        type: 'quest_started',
        questId: 'test-quest',
        questType: 'agency',
      },
      {
        type: 'quest_completed',
        questId: 'test-quest',
        questType: 'courage',
      },
    ];

    const result = summarize(events, state);

    expect(result?.title).toBe('Action completed');
    expect(result?.line).toContain('Courage');
  });

  it('prioritizes quest_started over re_entry_suggested', () => {
    const state = makeTestState();
    const events: EngineEvent[] = [
      {
        type: 're_entry_suggested',
        currentRange: 'long_gap',
      },
      {
        type: 'quest_started',
        questId: 'test-quest',
        questType: 'agency',
      },
    ];

    const result = summarize(events, state);

    expect(result?.title).toBe('Quest started');
  });

  it('prioritizes re_entry_suggested over time_context_changed', () => {
    const state = makeTestState();
    const events: EngineEvent[] = [
      {
        type: 'time_context_changed',
        previousRange: 'recent',
        newRange: 'gap',
      },
      {
        type: 're_entry_suggested',
        currentRange: 'long_gap',
      },
    ];

    const result = summarize(events, state);

    expect(result?.title).toBe('Return to action');
  });

  it('prioritizes time_context_changed over stat_changed', () => {
    const state = makeTestState();
    const events: EngineEvent[] = [
      {
        type: 'stat_changed',
        deltas: { agency: 1 },
      },
      {
        type: 'time_context_changed',
        previousRange: 'gap',
        newRange: 'recent',
      },
    ];

    const result = summarize(events, state);

    expect(result?.title).toBe('Momentum building');
  });

  it('never includes guilt language', () => {
    const state = makeTestState();
    const guiltWords = ['should', 'failed', 'make up for', 'lazy', 'missed'];

    const eventTypes: Array<EngineEvent['type']> = [
      'quest_completed',
      'quest_started',
      're_entry_suggested',
      'time_context_changed',
      'stat_changed',
      'flag_changed',
    ];

    for (const eventType of eventTypes) {
      let events: EngineEvent[] = [];

      switch (eventType) {
        case 'quest_completed':
          events = [
            { type: 'quest_completed', questId: 'test', questType: 'agency' },
          ];
          break;
        case 'quest_started':
          events = [
            { type: 'quest_started', questId: 'test', questType: 'agency' },
          ];
          break;
        case 're_entry_suggested':
          events = [{ type: 're_entry_suggested', currentRange: 'long_gap' }];
          break;
        case 'time_context_changed':
          events = [
            {
              type: 'time_context_changed',
              previousRange: 'recent',
              newRange: 'gap',
            },
          ];
          break;
        case 'stat_changed':
          events = [{ type: 'stat_changed', deltas: { agency: 1 } }];
          break;
        case 'flag_changed':
          events = [{ type: 'flag_changed', flagsSet: ['test-flag'] }];
          break;
      }

      const result = summarize(events, state);

      if (result) {
        const text = `${result.title} ${result.line} ${result.shareText || ''}`.toLowerCase();

        for (const word of guiltWords) {
          expect(text).not.toContain(word);
        }
      }
    }
  });

  it('respects character limits', () => {
    const state = makeTestState();
    const events: EngineEvent[] = [
      {
        type: 'quest_completed',
        questId: 'test-quest',
        questType: 'order',
      },
    ];

    const result = summarize(events, state);

    expect(result).not.toBeNull();
    expect(result?.title.length).toBeLessThanOrEqual(32);
    expect(result?.line.length).toBeLessThanOrEqual(140);
    if (result?.shareText) {
      expect(result.shareText.length).toBeLessThanOrEqual(180);
    }
  });

  it('handles all quest types correctly', () => {
    const state = makeTestState();
    const questTypes: Array<'agency' | 'courage' | 'order'> = [
      'agency',
      'courage',
      'order',
    ];

    for (const questType of questTypes) {
      const events: EngineEvent[] = [
        {
          type: 'quest_completed',
          questId: 'test-quest',
          questType,
        },
      ];

      const result = summarize(events, state);

      expect(result).not.toBeNull();
      expect(result?.line).toContain(
        questType.charAt(0).toUpperCase() + questType.slice(1)
      );
    }
  });
});
