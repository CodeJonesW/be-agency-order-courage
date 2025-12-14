/**
 * State serialization utilities for Durable Object storage.
 *
 * Converts between in-memory CharacterState (with Set flags) and
 * storage-friendly format (with string[] flags).
 */

import type { CharacterState, TimeContext } from '../domain/state';

/**
 * Storage-friendly state format (flags as string[]).
 */
export interface StoredState {
  stats: { agency: number; courage: number; order: number };
  flags: string[];
  timeContext: TimeContext;
}

/**
 * Converts CharacterState to storage format (Set → string[]).
 */
export function serializeState(state: CharacterState): StoredState {
  return {
    stats: { ...state.stats },
    flags: Array.from(state.flags),
    timeContext: { ...state.timeContext },
  };
}

/**
 * Converts stored state format to CharacterState (string[] → Set).
 */
export function deserializeState(stored: StoredState): CharacterState {
  return {
    stats: { ...stored.stats },
    flags: new Set(stored.flags),
    timeContext: { ...stored.timeContext },
  };
}

/**
 * Converts CharacterState to JSON-friendly format for API responses.
 * Flags are converted to string[] for JSON serialization.
 */
export function stateToJSON(state: CharacterState): {
  stats: { agency: number; courage: number; order: number };
  flags: string[];
  timeContext: TimeContext;
} {
  return {
    stats: { ...state.stats },
    flags: Array.from(state.flags),
    timeContext: { ...state.timeContext },
  };
}
