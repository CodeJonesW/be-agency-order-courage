import type { CharacterState } from './domain/state';
import { tick, startQuest, completeQuest } from './domain/engine';
import { catalog } from './quests/catalog';

/**
 * Worker "vertical slice" endpoint:
 * POST /api/smoke
 * body: { action: "tick" | "startQuest" | "completeQuest", questId?: string }
 *
 * Returns: { state, events }
 *
 * This is intentionally stateless (in-memory per request).
 * Persistence comes next.
 */

function makeInitialState(nowMs: number): CharacterState {
	return {
		stats: { agency: 5, courage: 3, order: 4 },
		flags: new Set(),
		timeContext: {
			range: 'long_gap',
			nowMs,
			lastMeaningfulActionMs: nowMs - 10 * 24 * 60 * 60 * 1000, // ~10 days ago
		},
	};
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/api/smoke' && request.method === 'POST') {
			const nowMs = Date.now();
			const state = makeInitialState(nowMs);

			let body: any;
			try {
				body = await request.json();
			} catch {
				return Response.json({ error: 'Invalid JSON' }, { status: 400 });
			}

			const action = body?.action as
				| 'tick'
				| 'startQuest'
				| 'completeQuest'
				| undefined;

			if (!action) {
				return Response.json(
					{ error: 'Missing action. Use: tick | startQuest | completeQuest' },
					{ status: 400 }
				);
			}

			if ((action === 'startQuest' || action === 'completeQuest') && !body?.questId) {
				return Response.json(
					{ error: 'Missing questId for startQuest/completeQuest' },
					{ status: 400 }
				);
			}

			let result:
				| { state: CharacterState; events: any[] }
				| { error: string };

			switch (action) {
				case 'tick':
					result = tick(state, nowMs);
					break;

				case 'startQuest':
					result = startQuest(state, body.questId, catalog, nowMs);
					break;

				case 'completeQuest':
					result = completeQuest(state, body.questId, catalog, nowMs);
					break;

				default:
					result = { error: 'Unknown action' };
			}

			return Response.json(result);
		}

		// keep the root path simple so you know the worker is alive
		if (url.pathname === '/' && request.method === 'GET') {
			return new Response('Worker alive. POST /api/smoke');
		}

		return new Response('Not Found', { status: 404 });
	},
};
