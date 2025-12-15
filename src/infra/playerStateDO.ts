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
import type { Receipt } from '../http/receipt';

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
   * Also handles receipt operations.
   * 
   * Uses ctx.storage (from DurableObject base class) to access storage.
   */
  async fetch(request: Request): Promise<Response> {
    const nowMs = Date.now();
    const url = new URL(request.url);

    // GET / or GET /get - get current state (returns stored format)
    if ((url.pathname === '/' || url.pathname === '/get') && request.method === 'GET') {
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

    // PUT / or PUT /put - update state (accepts stored format)
    if ((url.pathname === '/' || url.pathname === '/put') && request.method === 'PUT') {
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

    // GET /receipts - get all receipts (most recent first)
    if (url.pathname === '/receipts' && request.method === 'GET') {
      const receipts = await this.ctx.storage.get<Receipt[]>('receipts') || [];
      // Sort by createdAtMs descending (most recent first)
      const sortedReceipts = receipts.sort((a, b) => b.createdAtMs - a.createdAtMs);
      return Response.json({ receipts: sortedReceipts });
    }

    // GET /receipts/:id - get a specific receipt
    if (url.pathname.startsWith('/receipts/') && request.method === 'GET') {
      const receiptId = url.pathname.split('/').pop();
      const receipts = await this.ctx.storage.get<Receipt[]>('receipts') || [];
      const receipt = receipts.find((r) => r.id === receiptId);
      
      if (!receipt) {
        return Response.json({ error: 'Receipt not found' }, { status: 404 });
      }
      
      return Response.json({ receipt });
    }

    // POST /receipts - add a new receipt
    if (url.pathname === '/receipts' && request.method === 'POST') {
      try {
        const receipt = await request.json() as Receipt;
        const receipts = await this.ctx.storage.get<Receipt[]>('receipts') || [];
        
        // Add new receipt at the beginning (most recent first)
        const updatedReceipts = [receipt, ...receipts];
        
        // Keep only the most recent 50
        const cappedReceipts = updatedReceipts.slice(0, 50);
        
        await this.ctx.storage.put('receipts', cappedReceipts);
        
        return Response.json({ success: true });
      } catch (error) {
        console.error('Error saving receipt:', error);
        return Response.json({ error: 'Invalid receipt format', details: String(error) }, { status: 400 });
      }
    }

    return new Response('Method not allowed', { status: 405 });
  }
}
