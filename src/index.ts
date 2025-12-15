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
import { summarize } from './domain/narrative';
import type { Receipt } from './http/receipt';
import { generateDefaultShareText } from './http/receipt';

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
 * Returns both CharacterState and completion tracking data.
 */
async function getStateFromDO(
	doStub: DurableObjectStub,
	nowMs: number
): Promise<{ state: CharacterState; completedQuestIds: string[]; completedAtByQuestId: Record<string, number> }> {
	const response = await doStub.fetch(new Request('http://do/get', { method: 'GET' }));
	if (!response.ok) {
		throw new Error(`Failed to get state from DO: ${response.status}`);
	}
	const data = await response.json<{ state: StoredState }>();
	return {
		state: deserializeState(data.state),
		completedQuestIds: data.state.completedQuestIds || [],
		completedAtByQuestId: data.state.completedAtByQuestId || {},
	};
}

/**
 * Sets state in the Durable Object.
 * Merges completion tracking data with CharacterState.
 */
async function setStateInDO(
	doStub: DurableObjectStub,
	state: CharacterState,
	completedQuestIds: string[],
	completedAtByQuestId: Record<string, number>
): Promise<void> {
	const stored = serializeState(state, completedQuestIds, completedAtByQuestId);
	
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
			
			return new Response(JSON.stringify({ state: stateToJSON(state.state) }), {
				headers: responseHeaders,
			});
		}

		// GET /api/quests - returns 0-3 quest cards selected by quest logic from stored state
		if (url.pathname === '/api/quests' && request.method === 'GET') {
			const { playerId, headers: cookieHeaders } = getOrCreatePlayerId(request);
			const doStub = getPlayerDO(env, playerId);
			const { state, completedQuestIds, completedAtByQuestId } = await getStateFromDO(doStub, nowMs);

			// Get all quests from catalog
			const allQuests = catalog.listAll?.() ?? [];

			// Filter out completed quests based on repeatability
			const availableQuests = allQuests.filter((quest) => {
				// If quest is completed
				if (completedQuestIds.includes(quest.id)) {
					// If quest is repeatable, check cooldown
					if (quest.repeatable) {
						const completedAt = completedAtByQuestId[quest.id];
						if (completedAt !== undefined) {
							const elapsed = nowMs - completedAt;
							return elapsed >= quest.repeatable.cooldownMs;
						}
					}
					// Non-repeatable quests are filtered out
					return false;
				}
				// Quest not completed, available
				return true;
			});

			// Use rules pipeline directly: filter → rank → select
			const selectedQuests = chooseQuests(state, availableQuests, nowMs, 3);

			// Convert to DTOs (excludes consequence and availability)
			const questCards: QuestCardDTO[] = selectedQuests.map(toQuestCardDTO);

			const responseHeaders = cookieHeaders ? new Headers(cookieHeaders) : new Headers();
			responseHeaders.set('Content-Type', 'application/json');
			
			// If no quests available, return calm narrative
			if (questCards.length === 0) {
				const calmNarrative = {
					tone: 'calm' as const,
					title: 'Quiet moment',
					line: "Nothing urgent right now. Come back when you want a next step.",
				};
				return new Response(JSON.stringify({ quests: [], narrative: calmNarrative }), {
					headers: responseHeaders,
				});
			}

			return new Response(JSON.stringify({ quests: questCards }), {
				headers: responseHeaders,
			});
		}

		// POST /api/quests/:id/start - starts a quest
		if (url.pathname.startsWith('/api/quests/') && url.pathname.endsWith('/start') && request.method === 'POST') {
			const { playerId, headers: cookieHeaders } = getOrCreatePlayerId(request);
			const pathParts = url.pathname.split('/');
			const questId = pathParts[pathParts.length - 2]; // Get quest id before '/start'

			const doStub = getPlayerDO(env, playerId);
			const { state, completedQuestIds, completedAtByQuestId } = await getStateFromDO(doStub, nowMs);

			const result = startQuest(state, questId, catalog, nowMs);
			
			// Save state and wait for it to complete
			try {
				await setStateInDO(doStub, result.state, completedQuestIds, completedAtByQuestId);
			} catch (error) {
				console.error('Failed to save state after startQuest:', error);
				return Response.json({ error: 'Failed to save state', details: String(error) }, { status: 500 });
			}

			const narrative = summarize(result.events, result.state);

			const responseHeaders = cookieHeaders ? new Headers(cookieHeaders) : new Headers();
			responseHeaders.set('Content-Type', 'application/json');
			
			return new Response(JSON.stringify({
				state: stateToJSON(result.state),
				events: result.events,
				narrative,
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
			const { state, completedQuestIds, completedAtByQuestId } = await getStateFromDO(doStub, nowMs);

			const result = completeQuest(state, questId, catalog, nowMs);
			
			// Track completed quest
			const updatedCompletedQuestIds = completedQuestIds.includes(questId)
				? completedQuestIds
				: [...completedQuestIds, questId];
			const updatedCompletedAtByQuestId = {
				...completedAtByQuestId,
				[questId]: nowMs,
			};
			
			// Save state and wait for it to complete
			try {
				await setStateInDO(doStub, result.state, updatedCompletedQuestIds, updatedCompletedAtByQuestId);
			} catch (error) {
				console.error('Failed to save state after completeQuest:', error);
				return Response.json({ error: 'Failed to save state', details: String(error) }, { status: 500 });
			}

			const narrative = summarize(result.events, result.state);

			// Generate receipt
			const quest = catalog.getQuestById(questId);
			if (!quest) {
				return Response.json({ error: 'Quest not found' }, { status: 404 });
			}

			const shareText = narrative?.shareText || generateDefaultShareText(quest.type);
			const receipt: Receipt = {
				id: crypto.randomUUID(),
				createdAtMs: nowMs,
				questId,
				questType: quest.type,
				tone: narrative?.tone || 'calm',
				title: narrative?.title || 'Action completed',
				line: narrative?.line || 'You took a step forward.',
				shareText,
			};

			// Save receipt to DO
			try {
				const receiptResponse = await doStub.fetch(
					new Request('http://do/receipts', {
						method: 'POST',
						body: JSON.stringify(receipt),
						headers: { 'Content-Type': 'application/json' },
					})
				);
				if (!receiptResponse.ok) {
					console.error('Failed to save receipt:', await receiptResponse.text());
				}
			} catch (error) {
				console.error('Error saving receipt:', error);
				// Don't fail the request if receipt save fails
			}

			const responseHeaders = cookieHeaders ? new Headers(cookieHeaders) : new Headers();
			responseHeaders.set('Content-Type', 'application/json');
			
			return new Response(JSON.stringify({
				state: stateToJSON(result.state),
				events: result.events,
				narrative,
				receipt,
			}), {
				headers: responseHeaders,
			});
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
					lastMeaningfulActionMs: Date.now() - 1000,
				},
				completedQuestIds: [],
				completedAtByQuestId: {},
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

		// GET /api/receipts - get all receipts (most recent first)
		if (url.pathname === '/api/receipts' && request.method === 'GET') {
			const { playerId, headers: cookieHeaders } = getOrCreatePlayerId(request);
			const doStub = getPlayerDO(env, playerId);

			const response = await doStub.fetch(new Request('http://do/receipts', { method: 'GET' }));
			if (!response.ok) {
				return Response.json({ error: 'Failed to fetch receipts' }, { status: 500 });
			}

			const data = await response.json<{ receipts: Receipt[] }>();

			const responseHeaders = cookieHeaders ? new Headers(cookieHeaders) : new Headers();
			responseHeaders.set('Content-Type', 'application/json');

			return new Response(JSON.stringify(data), {
				headers: responseHeaders,
			});
		}

		// GET /api/receipts/:id - get a specific receipt
		if (url.pathname.startsWith('/api/receipts/') && request.method === 'GET') {
			const { playerId, headers: cookieHeaders } = getOrCreatePlayerId(request);
			const pathParts = url.pathname.split('/');
			const receiptId = pathParts[pathParts.length - 1];
			const doStub = getPlayerDO(env, playerId);

			const response = await doStub.fetch(new Request(`http://do/receipts/${receiptId}`, { method: 'GET' }));

			const responseHeaders = cookieHeaders ? new Headers(cookieHeaders) : new Headers();
			responseHeaders.set('Content-Type', 'application/json');

			if (!response.ok) {
				return new Response(JSON.stringify({ error: 'Receipt not found' }), {
					status: 404,
					headers: responseHeaders,
				});
			}

			return new Response(JSON.stringify(await response.json()), {
				headers: responseHeaders,
			});
		}

		// GET / - simple health check
		if (url.pathname === '/' && request.method === 'GET') {
			return new Response('Worker alive');
		}

		return new Response('Not Found', { status: 404 });
	},
};
