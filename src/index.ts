/**
 * Manual test instructions:
 * 
 * npm run dev
 * 
 * # IMPORTANT: Use curl with cookie jar to maintain playerId across requests
 * # Without cookies, each request creates a new player with default state!
 * 
 * # Get state (creates new player, saves cookie to cookies.txt)
 * curl -c cookies.txt http://localhost:8787/api/state
 * 
 * # Get quests (uses saved cookie)
 * curl -b cookies.txt http://localhost:8787/api/quests
 * 
 * # Start quest (uses saved cookie)
 * curl -b cookies.txt -X POST http://localhost:8787/api/quests/v1-reentry-agency-1/start
 * 
 * # Complete quest (uses saved cookie)
 * curl -b cookies.txt -X POST http://localhost:8787/api/quests/v1-reentry-agency-1/complete
 * 
 * # Verify persistence (uses saved cookie - should show updated state)
 * curl -b cookies.txt http://localhost:8787/api/state
 */

import type { CharacterState } from './domain/state';
import { tick, startQuest, completeQuest } from './domain/engine';
import { catalog } from './quests/catalog';
import { chooseQuests } from './domain/rules';
import type { QuestNodeWithAvailability } from './domain/quests';
import type { QuestCardDTO } from './http/dto';
import { getCookie, setCookie } from './http/cookies';
import { generateUUID } from './http/uuid';
import { stateToJSON, deserializeState, serializeState, type StoredState } from './http/state-serialization';
import { PlayerStateDO } from './infra/playerStateDO';

// Export Durable Object class for wrangler binding
export { PlayerStateDO };

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

/**
 * Gets or creates a playerId from cookies.
 * Returns the playerId and a Headers object with Set-Cookie if a new ID was generated.
 */
function getOrCreatePlayerId(request: Request): { playerId: string; headers?: Headers } {
	const cookieHeader = request.headers.get('Cookie');
	let playerId = getCookie(cookieHeader, 'playerId');

	if (!playerId) {
		// Generate new UUID and set cookie
		playerId = generateUUID();
		const headers = new Headers();
		
		// Detect if we're in production (HTTPS)
		const url = new URL(request.url);
		const isProduction = url.protocol === 'https:';
		
		const headersWithCookie = setCookie(headers, 'playerId', playerId, {
			path: '/',
			maxAge: 60 * 60 * 24 * 365, // 1 year
			sameSite: 'lax',
			secure: isProduction, // Auto-enable Secure in production
			httpOnly: true, // Prevent JavaScript access
		});
		return { playerId, headers: headersWithCookie };
	}

	return { playerId };
}

/**
 * Gets the Durable Object stub for a player.
 */
function getPlayerDO(env: Env, playerId: string): DurableObjectStub {
	const id = env.PLAYER_STATE_DO.idFromName(playerId);
	return env.PLAYER_STATE_DO.get(id);
}

/**
 * Gets state from the Durable Object.
 */
async function getStateFromDO(doStub: DurableObjectStub, nowMs: number): Promise<CharacterState> {
	const response = await doStub.fetch(new Request('http://do/get', { method: 'GET' }));
	if (!response.ok) {
		throw new Error(`Failed to get state from DO: ${response.status}`);
	}
	const data = await response.json<{ state: StoredState }>();
	return deserializeState(data.state);
}

/**
 * Sets state in the Durable Object.
 */
async function setStateInDO(doStub: DurableObjectStub, state: CharacterState): Promise<void> {
	const stored = serializeState(state);
	
	const response = await doStub.fetch(
		new Request('http://do/put', {
			method: 'PUT',
			body: JSON.stringify(stored),
			headers: { 'Content-Type': 'application/json' },
		})
	);
	
	// Read response body once
	const result = await response.json().catch(async () => {
		const text = await response.text().catch(() => 'Unknown error');
		return { error: text };
	}) as { success?: boolean; error?: string };
	
	if (!response.ok) {
		throw new Error(`Failed to save state: ${response.status} ${JSON.stringify(result)}`);
	}
	
	if (!result || !result.success) {
		throw new Error(`State save did not confirm success: ${JSON.stringify(result)}`);
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const nowMs = Date.now();

		// GET /api/state - returns current player state
		if (url.pathname === '/api/state' && request.method === 'GET') {
			const { playerId, headers: cookieHeaders } = getOrCreatePlayerId(request);
			const doStub = getPlayerDO(env, playerId);
			const state = await getStateFromDO(doStub, nowMs);

			const responseHeaders = new Headers();
			responseHeaders.set('Content-Type', 'application/json');
			
			// Add cookie headers if new player was created
			if (cookieHeaders) {
				cookieHeaders.forEach((value, key) => {
					responseHeaders.append(key, value);
				});
			}
			
			return new Response(JSON.stringify({ state: stateToJSON(state) }), {
				headers: responseHeaders,
			});
		}

		// GET /api/quests - returns 0-3 quest cards selected by quest logic from stored state
		if (url.pathname === '/api/quests' && request.method === 'GET') {
			const { playerId, headers: cookieHeaders } = getOrCreatePlayerId(request);
			const doStub = getPlayerDO(env, playerId);
			const state = await getStateFromDO(doStub, nowMs);

			// Get all quests from catalog
			const allQuests = catalog.listAll?.() ?? [];

			// Use rules pipeline directly: filter → rank → select
			const selectedQuests = chooseQuests(state, allQuests, nowMs, 3);

			// Convert to DTOs (excludes consequence and availability)
			const questCards: QuestCardDTO[] = selectedQuests.map(toQuestCardDTO);

			const responseHeaders = cookieHeaders ? new Headers(cookieHeaders) : new Headers();
			responseHeaders.set('Content-Type', 'application/json');
			
			const response = new Response(JSON.stringify({ quests: questCards }), {
				headers: responseHeaders,
			});

			return response;
		}

		// POST /api/quests/:id/start - starts a quest
		if (url.pathname.startsWith('/api/quests/') && url.pathname.endsWith('/start') && request.method === 'POST') {
			const { playerId, headers: cookieHeaders } = getOrCreatePlayerId(request);
			const pathParts = url.pathname.split('/');
			const questId = pathParts[pathParts.length - 2]; // Get quest id before '/start'

			const doStub = getPlayerDO(env, playerId);
			const state = await getStateFromDO(doStub, nowMs);

			const result = startQuest(state, questId, catalog, nowMs);
			
			// Save state and wait for it to complete
			try {
				await setStateInDO(doStub, result.state);
			} catch (error) {
				console.error('Failed to save state after startQuest:', error);
				return Response.json({ error: 'Failed to save state', details: String(error) }, { status: 500 });
			}

			const responseHeaders = cookieHeaders ? new Headers(cookieHeaders) : new Headers();
			responseHeaders.set('Content-Type', 'application/json');
			
			return new Response(JSON.stringify({
				state: stateToJSON(result.state),
				events: result.events,
			}), {
				headers: responseHeaders,
			});
		}

		// POST /api/quests/:id/complete - completes a quest
		if (url.pathname.startsWith('/api/quests/') && url.pathname.endsWith('/complete') && request.method === 'POST') {
			const { playerId, headers: cookieHeaders } = getOrCreatePlayerId(request);
			const pathParts = url.pathname.split('/');
			const questId = pathParts[pathParts.length - 2]; // Get quest id before '/complete'

			const doStub = getPlayerDO(env, playerId);
			const state = await getStateFromDO(doStub, nowMs);

			const result = completeQuest(state, questId, catalog, nowMs);
			
			// Save state and wait for it to complete
			try {
				await setStateInDO(doStub, result.state);
			} catch (error) {
				console.error('Failed to save state after completeQuest:', error);
				return Response.json({ error: 'Failed to save state', details: String(error) }, { status: 500 });
			}

			const responseHeaders = cookieHeaders ? new Headers(cookieHeaders) : new Headers();
			responseHeaders.set('Content-Type', 'application/json');
			
			const response = new Response(JSON.stringify({
				state: stateToJSON(result.state),
				events: result.events,
			}), {
				headers: responseHeaders,
			});

			return response;
		}

		// GET /debug/do - debug endpoint to check DO state
		if (url.pathname === '/debug/do' && request.method === 'GET') {
			const { playerId } = getOrCreatePlayerId(request);
			const doStub = getPlayerDO(env, playerId);
			const doId = doStub.id.toString();
			
			// Try to get state directly
			const response = await doStub.fetch(new Request('http://do/get', { method: 'GET' }));
			const data = await response.json<{ state: StoredState }>();
			
			return Response.json({
				playerId,
				doId,
				state: data.state,
				storageKey: 'state',
			});
		}

		// POST /debug/do/test-save - test saving state directly
		if (url.pathname === '/debug/do/test-save' && request.method === 'POST') {
			const { playerId } = getOrCreatePlayerId(request);
			const doStub = getPlayerDO(env, playerId);
			const doId = doStub.id.toString();
			
			// Create a test state
			const testState: StoredState = {
				stats: { agency: 99, courage: 99, order: 99 },
				flags: ['test-flag'],
				timeContext: {
					range: 'recent',
					nowMs: Date.now(),
					lastMeaningfulActionMs: Date.now(),
				},
			};
			
			// Try to save it
			const putResponse = await doStub.fetch(
				new Request('http://do/put', {
					method: 'PUT',
					body: JSON.stringify(testState),
					headers: { 'Content-Type': 'application/json' },
				})
			);
			
			const putResult = await putResponse.json();
			
			// Immediately get it back
			const getResponse = await doStub.fetch(new Request('http://do/get', { method: 'GET' }));
			const getData = await getResponse.json<{ state: StoredState }>();
			
			return Response.json({
				playerId,
				doId,
				putResult,
				retrievedState: getData.state,
				match: getData.state.stats.agency === testState.stats.agency,
			});
		}

		// GET / - simple health check
		if (url.pathname === '/' && request.method === 'GET') {
			return new Response('Worker alive');
		}

		return new Response('Not Found', { status: 404 });
	},
};
