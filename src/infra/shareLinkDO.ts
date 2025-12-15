/**
 * Durable Object for storing share links.
 *
 * Each share link is stored in its own DO instance, keyed by token.
 * This allows public access without requiring player authentication.
 */

import { DurableObject } from 'cloudflare:workers';
import type { ShareLinkData } from '../http/share-link';

/**
 * ShareLinkDO: Durable Object that stores a single share link.
 * 
 * The DO is keyed by token, allowing public access via GET /r/:token.
 */
export class ShareLinkDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  /**
   * HTTP handler for the Durable Object.
   * Handles GET (get share link data) requests.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // GET / - get share link data
    if (url.pathname === '/' && request.method === 'GET') {
      const data = await this.ctx.storage.get<ShareLinkData>('data');
      
      if (!data) {
        return Response.json({ error: 'Share link not found' }, { status: 404 });
      }

      // Check if revoked
      if (data.shareLink.revoked) {
        return Response.json({ error: 'Share link revoked' }, { status: 404 });
      }

      return Response.json({ data });
    }

    // PUT / - store share link data
    if (url.pathname === '/' && request.method === 'PUT') {
      try {
        const body = await request.json() as ShareLinkData;
        await this.ctx.storage.put('data', body);
        return Response.json({ success: true });
      } catch (error) {
        console.error('Error saving share link:', error);
        return Response.json({ error: 'Invalid share link format', details: String(error) }, { status: 400 });
      }
    }

    return new Response('Method not allowed', { status: 405 });
  }
}
