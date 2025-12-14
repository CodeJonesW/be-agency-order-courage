/**
 * Developer smoke test for the life-as-a-game engine.
 *
 * This script is intentionally simple and explicit.
 * Its purpose is to prove that:
 * - quests become available
 * - starting a quest emits events
 * - completing a quest mutates state and emits consequences
 *
 * Run with:
 *   npx ts-node src/dev/smoke.ts
 *
 * or equivalent TS runner.
 */

import { tick, startQuest, completeQuest, getAvailableQuests } from '../domain/engine.js';
import type { CharacterState } from '../domain/state.js';
import { catalog } from '../quests/catalog.js';

// -----------------------------------------------------------------------------
// Initial State (Long Gap Re-entry)
// -----------------------------------------------------------------------------

const initialState: CharacterState = {
  stats: {
    agency: 3,
    courage: 2,
    order: 2,
  },
  flags: new Set(),
  timeContext: {
    range: 'long_gap',
    nowMs: Date.now(),
    lastMeaningfulActionMs: Date.now() - 10 * 24 * 60 * 60 * 1000, // ~10 days ago
  },
};

console.log('\n=== INITIAL STATE ===');
console.dir(initialState, { depth: null });

// -----------------------------------------------------------------------------
// Tick (time drift)
// -----------------------------------------------------------------------------

const nowMs = Date.now();

const tickResult = tick(initialState, nowMs);

console.log('\n=== AFTER TICK ===');
console.log('Events:');
console.dir(tickResult.events, { depth: null });
console.log('State:');
console.dir(tickResult.state, { depth: null });

// -----------------------------------------------------------------------------
// Get Available Quests
// -----------------------------------------------------------------------------

const availableQuests = getAvailableQuests(
  tickResult.state,
  catalog,
  nowMs
);

console.log('\n=== AVAILABLE QUESTS ===');
availableQuests.forEach((q, i) => {
  console.log(`${i + 1}. ${q.id} [${q.type}]`);
  console.log(`   Context: ${q.context}`);
});

// Guard: nothing to do
if (availableQuests.length === 0) {
  console.log('\n(No quests available)');
  process.exit(0);
}

const quest = availableQuests[0];

// -----------------------------------------------------------------------------
// Start Quest
// -----------------------------------------------------------------------------

const startResult = startQuest(
  tickResult.state,
  quest.id,
  catalog,
  nowMs
);

console.log('\n=== START QUEST ===');
console.log('Events:');
console.dir(startResult.events, { depth: null });
console.log('State:');
console.dir(startResult.state, { depth: null });

// -----------------------------------------------------------------------------
// Complete Quest
// -----------------------------------------------------------------------------

const completeResult = completeQuest(
  startResult.state,
  quest.id,
  catalog,
  nowMs
);

console.log('\n=== COMPLETE QUEST ===');
console.log('Events:');
console.dir(completeResult.events, { depth: null });
console.log('State:');
console.dir(completeResult.state, { depth: null });

// -----------------------------------------------------------------------------
// Done
// -----------------------------------------------------------------------------

console.log('\n=== DONE ===');
