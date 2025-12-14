/**
 * Manual test instructions:
 * 
 * npm run dev
 * curl http://localhost:8787/api/quests
 */

import type { CharacterState } from './domain/state';
import { tick, startQuest, completeQuest } from './domain/engine';
import { catalog } from './quests/catalog';
import { chooseQuests } from './domain/rules';
import type { QuestNodeWithAvailability } from './domain/quests';
import type { QuestCardDTO } from './http/dto';

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

/**
 * Converts a QuestNodeWithAvailability to a QuestCardDTO (excludes consequence and availability).
 */
function toQuestCardDTO(quest: QuestNodeWithAvailability): QuestCardDTO {
	return {
		id: quest.id,
		type: quest.type,
		context: quest.context,
		realWorldAction: quest.realWorldAction,
		constraint: quest.constraint,
		reflection: quest.reflection,
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

		// GET /api/quests - returns 0-3 quest cards selected by quest logic
		if (url.pathname === '/api/quests' && request.method === 'GET') {
			const nowMs = Date.now();
			const state = makeInitialState(nowMs);

			// Get all quests from catalog
			const allQuests = catalog.listAll?.() ?? [];

			// Use rules pipeline directly: filter → rank → select
			const selectedQuests = chooseQuests(state, allQuests, nowMs, 3);

			// Convert to DTOs (excludes consequence and availability)
			const questCards: QuestCardDTO[] = selectedQuests.map(toQuestCardDTO);

			return Response.json({ quests: questCards });
		}

		// GET / - simple health check
		if (url.pathname === '/' && request.method === 'GET') {
			return new Response('Worker alive');
		}

		return new Response('Not Found', { status: 404 });
	},
};
