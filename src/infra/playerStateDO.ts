/**
 * Durable Object for storing player character state.
 *
 * This DO maintains persistent state for each player across requests.
 * State is stored in DO storage and rehydrated on each request.
 *
 * Follows Cloudflare's recommended pattern:
 * https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/
 */

import { DurableObject } from 'cloudflare:workers';
import type { CharacterState } from '../domain/state';
import { serializeState, deserializeState, type StoredState } from '../http/state-serialization';

/**
 * Default state for new players.
 */
function makeDefaultState(nowMs: number): StoredState {
  return {
    stats: { agency: 5, courage: 3, order: 4 },
    flags: [],
    timeContext: {
      range: 'long_gap',
      nowMs,
      lastMeaningfulActionMs: undefined,
    },
    completedQuestIds: [],
    completedAtByQuestId: {},
  };
}

/**
 * PlayerStateDO: Durable Object that stores CharacterState for a single player.
 * 
 * Extends DurableObject to follow Cloudflare's recommended pattern.
 */
export class PlayerStateDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }


  /**
   * HTTP handler for the Durable Object.
   * Handles GET (get state) and PUT (set state) requests.
   * 
   * Uses ctx.storage (from DurableObject base class) to access storage.
   */
  async fetch(request: Request): Promise<Response> {
    const nowMs = Date.now();

    // GET / - get current state (returns stored format)
    if (request.method === 'GET') {
      const stored = await this.ctx.storage.get<StoredState>('state');
      
      if (!stored) {
        // No state exists, return default
        const defaultState = makeDefaultState(nowMs);
        await this.ctx.storage.put('state', defaultState);
        return Response.json({ state: defaultState });
      }

      // Create a copy with updated nowMs (don't mutate the stored object)
      const stateWithUpdatedTime: StoredState = {
        ...stored,
        timeContext: {
          ...stored.timeContext,
          nowMs,
        },
      };
      
      return Response.json({ state: stateWithUpdatedTime });
    }

    // PUT / - update state (accepts stored format)
    if (request.method === 'PUT') {
      try {
        const body = await request.json() as StoredState;
        
        // Save the state directly - storage.put is already persistent
        await this.ctx.storage.put('state', body);
        
        return Response.json({ success: true });
      } catch (error) {
        console.error('Error saving state:', error);
        return Response.json({ error: 'Invalid state format', details: String(error) }, { status: 400 });
      }
    }

    return new Response('Method not allowed', { status: 405 });
  }
}
