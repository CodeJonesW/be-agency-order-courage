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
import { ShareLinkDO } from './infra/shareLinkDO';
import { summarize } from './domain/narrative';
import type { Receipt } from './http/receipt';
import { generateDefaultShareText } from './http/receipt';
import type { ShareLink, ShareLinkData } from './http/share-link';
import type { QuestAction } from './http/quest-action';

// Export Durable Object classes for wrangler binding
// These must be exported for Wrangler to create bindings
export { PlayerStateDO } from './infra/playerStateDO';
export { ShareLinkDO } from './infra/shareLinkDO';

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
 * Checks if any quest was completed today (same calendar day in UTC).
 * Returns true if any completion timestamp falls within today's date.
 */
function hasCompletedQuestToday(completedAtByQuestId: Record<string, number>, nowMs: number): boolean {
	const todayStart = new Date(nowMs);
	todayStart.setUTCHours(0, 0, 0, 0);
	const todayStartMs = todayStart.getTime();
	
	const todayEnd = new Date(nowMs);
	todayEnd.setUTCHours(23, 59, 59, 999);
	const todayEndMs = todayEnd.getTime();
	
	// Check if any completion timestamp falls within today
	return Object.values(completedAtByQuestId).some(
		completedAt => completedAt >= todayStartMs && completedAt <= todayEndMs
	);
}

/**
 * Gets or creates a playerId from cookies or header.
 * Returns the playerId and a Headers object with Set-Cookie to refresh/extend the cookie.
 * Always refreshes the cookie to extend its lifetime, preventing expiration.
 * 
 * Fallback: Also checks X-Player-Id header for mobile Safari compatibility
 * (Safari blocks third-party cookies even with SameSite=None).
 */
function getOrCreatePlayerId(request: Request): { playerId: string; headers: Headers } {
	const cookieHeader = request.headers.get('Cookie');
	let playerId = getCookie(cookieHeader, 'playerId');

	// Fallback: Check header for mobile Safari (cookies blocked by ITP)
	if (!playerId) {
		playerId = request.headers.get('X-Player-Id');
	}

	if (!playerId) {
		// Generate new UUID
		playerId = generateUUID();
	}

	// Always refresh the cookie to extend its lifetime
	// This prevents cookies from expiring and losing player progress
	const headers = new Headers();
	
	// Detect if we're in production (HTTPS)
	const url = new URL(request.url);
	const isProduction = url.protocol === 'https:';
	
	// Check if this is a cross-origin request
	const origin = request.headers.get('Origin');
	const isCrossOrigin = origin && new URL(origin).origin !== url.origin;
	
	// For cross-origin requests, use SameSite=None and Secure=true
	// For same-origin, use SameSite=Lax
	// Note: SameSite=None REQUIRES Secure=true, so only use it in production
	const sameSite = isCrossOrigin && isProduction ? 'none' : 'lax';
	// Secure must be true when SameSite=None, otherwise use isProduction
	const secure = sameSite === 'none' ? true : isProduction;
	
	const headersWithCookie = setCookie(headers, 'playerId', playerId, {
		path: '/',
		maxAge: 60 * 60 * 24 * 365, // 1 year
		sameSite,
		secure, // Required for SameSite=None, otherwise matches production
		httpOnly: true, // Prevent JavaScript access
	});
	
	return { playerId, headers: headersWithCookie };
}

/**
 * Gets the Durable Object stub for a player.
 */
function getPlayerDO(env: Env, playerId: string): DurableObjectStub {
	const id = env.PLAYER_STATE_DO.idFromName(playerId);
	return env.PLAYER_STATE_DO.get(id);
}

/**
 * Gets the Durable Object stub for a share link (keyed by token).
 */
function getShareLinkDO(env: Env, token: string): DurableObjectStub {
	const id = env.SHARE_LINK_DO.idFromName(token);
	return env.SHARE_LINK_DO.get(id);
}

/**
 * Adds CORS headers to a response.
 */
function addCorsHeaders(headers: Headers, request: Request): Headers {
	const origin = request.headers.get('Origin');
	// Allow requests from the frontend domain
	const allowedOrigins = [
		'https://fe-agency-order-courage.pages.dev',
		'http://localhost:5173',
		'http://localhost:3000',
	];

	if (origin && allowedOrigins.includes(origin)) {
		headers.set('Access-Control-Allow-Origin', origin);
		headers.set('Access-Control-Allow-Credentials', 'true');
		headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Player-Id');
		headers.set('Access-Control-Max-Age', '86400');
	}

	return headers;
}

/**
 * Handles CORS preflight requests.
 */
function handleCorsPreflight(request: Request): Response | null {
	if (request.method === 'OPTIONS') {
		const headers = new Headers();
		addCorsHeaders(headers, request);
		return new Response(null, { headers, status: 204 });
	}
	return null;
}

/**
 * Generates HTML page for public receipt view.
 */
function generateReceiptPage(receipt: ShareLinkData['receipt']): string {
	const typeColors = {
		agency: '#6b8e9f',
		courage: '#d4a574',
		order: '#8b6f7e',
	};

	const typeLabels = {
		agency: 'Agency',
		courage: 'Courage',
		order: 'Order',
	};

	const color = typeColors[receipt.questType];
	const label = typeLabels[receipt.questType];

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${receipt.title}</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
			background: #0a0a0a;
			color: #e0e0e0;
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 2rem;
		}
		.receipt-page {
			background: linear-gradient(135deg, #2a1f1a 0%, #1a1510 100%);
			border: 3px solid ${color};
			border-radius: 8px;
			padding: 3rem;
			max-width: 600px;
			width: 100%;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
		}
		.receipt-page__badge {
			display: inline-block;
			padding: 0.5rem 1rem;
			border-radius: 4px;
			font-size: 0.875rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			color: #fff;
			margin-bottom: 1.5rem;
			background: ${color};
		}
		.receipt-page__title {
			font-size: 2rem;
			font-weight: 600;
			color: #fff;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			margin-bottom: 1rem;
		}
		.receipt-page__line {
			font-size: 1.2rem;
			line-height: 1.6;
			color: #d0d0d0;
			margin-bottom: 2rem;
		}
		.receipt-page__share {
			margin-top: 2rem;
			padding-top: 2rem;
			border-top: 2px solid rgba(139, 115, 85, 0.3);
		}
		.receipt-page__share-text {
			font-size: 1.1rem;
			line-height: 1.6;
			color: #c0c0c0;
			font-style: italic;
		}
		.receipt-page__meta {
			margin-top: 2rem;
			padding-top: 1.5rem;
			border-top: 1px solid rgba(139, 115, 85, 0.2);
			font-size: 0.9rem;
			color: #888;
			text-align: center;
		}
	</style>
</head>
<body>
	<div class="receipt-page">
		<div class="receipt-page__badge">${label}</div>
		<h1 class="receipt-page__title">${receipt.title}</h1>
		<p class="receipt-page__line">${receipt.line}</p>
		<div class="receipt-page__share">
			<p class="receipt-page__share-text">${receipt.shareText}</p>
		</div>
		<div class="receipt-page__meta">A recent step</div>
	</div>
</body>
</html>`;
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

		// Handle CORS preflight
		const preflightResponse = handleCorsPreflight(request);
		if (preflightResponse) {
			return preflightResponse;
		}

		// GET /api/state - returns current player state
		if (url.pathname === '/api/state' && request.method === 'GET') {
			const { playerId, headers: cookieHeaders } = getOrCreatePlayerId(request);
			const doStub = getPlayerDO(env, playerId);
			const state = await getStateFromDO(doStub, nowMs);

			const responseHeaders = new Headers(cookieHeaders);
			responseHeaders.set('Content-Type', 'application/json');
			addCorsHeaders(responseHeaders, request);
			
			return new Response(JSON.stringify({ state: stateToJSON(state.state), playerId }), {
				headers: responseHeaders,
			});
		}

		// GET /api/quests - returns 0-1 quest cards selected by quest logic from stored state
		if (url.pathname === '/api/quests' && request.method === 'GET') {
			const { playerId, headers: cookieHeaders } = getOrCreatePlayerId(request);
			const doStub = getPlayerDO(env, playerId);
			const { state, completedQuestIds, completedAtByQuestId } = await getStateFromDO(doStub, nowMs);

			const responseHeaders = new Headers(cookieHeaders);
			responseHeaders.set('Content-Type', 'application/json');
			addCorsHeaders(responseHeaders, request);

			// Check if user already completed a quest today (1 quest per day limit)
			if (hasCompletedQuestToday(completedAtByQuestId, nowMs)) {
				const calmNarrative = {
					tone: 'calm' as const,
					title: 'Rest for today',
					line: "You've already taken a step today. Come back tomorrow for your next quest.",
				};
				return new Response(JSON.stringify({ quests: [], narrative: calmNarrative, playerId }), {
					headers: responseHeaders,
				});
			}

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
			const selectedQuests = chooseQuests(state, availableQuests, nowMs, 1);

			// Convert to DTOs (excludes consequence and availability)
			const questCards: QuestCardDTO[] = selectedQuests.map(toQuestCardDTO);
			
			// If no quests available, return calm narrative
			if (questCards.length === 0) {
				const calmNarrative = {
					tone: 'calm' as const,
					title: 'Quiet moment',
					line: "Nothing urgent right now. Come back when you want a next step.",
				};
				return new Response(JSON.stringify({ quests: [], narrative: calmNarrative, playerId }), {
					headers: responseHeaders,
				});
			}

			return new Response(JSON.stringify({ quests: questCards, playerId }), {
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

			const responseHeaders = new Headers(cookieHeaders);
			responseHeaders.set('Content-Type', 'application/json');
			addCorsHeaders(responseHeaders, request);
			
			return new Response(JSON.stringify({
				state: stateToJSON(result.state),
				events: result.events,
				narrative,
				playerId,
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

			const responseHeaders = new Headers(cookieHeaders);
			responseHeaders.set('Content-Type', 'application/json');
			addCorsHeaders(responseHeaders, request);
			
			return new Response(JSON.stringify({
				state: stateToJSON(result.state),
				events: result.events,
				narrative,
				receipt,
				playerId,
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

		// GET /api/receipts - get all receipts (most recent first) with associated actions
		if (url.pathname === '/api/receipts' && request.method === 'GET') {
			const { playerId, headers: cookieHeaders } = getOrCreatePlayerId(request);
			const doStub = getPlayerDO(env, playerId);

			// Fetch receipts and actions in parallel
			const [receiptsResponse, actionsResponse] = await Promise.all([
				doStub.fetch(new Request('http://do/receipts', { method: 'GET' })),
				doStub.fetch(new Request('http://do/quest-actions', { method: 'GET' })),
			]);

			if (!receiptsResponse.ok) {
				return Response.json({ error: 'Failed to fetch receipts' }, { status: 500 });
			}

			const receiptsData = await receiptsResponse.json<{ receipts: Receipt[] }>();
			const actionsData = await actionsResponse.json<{ actions: QuestAction[] }>();

			// Create a map of questId -> most recent action
			const actionsByQuestId = new Map<string, QuestAction>();
			for (const action of actionsData.actions) {
				// Keep only the most recent action for each quest
				const existing = actionsByQuestId.get(action.questId);
				if (!existing || action.createdAtMs > existing.createdAtMs) {
					actionsByQuestId.set(action.questId, action);
				}
			}

			// Attach actions to receipts
			const receiptsWithActions = receiptsData.receipts.map((receipt) => {
				const action = actionsByQuestId.get(receipt.questId);
				return {
					...receipt,
					action: action?.action || undefined,
				};
			});

			const responseHeaders = new Headers(cookieHeaders);
			responseHeaders.set('Content-Type', 'application/json');
			addCorsHeaders(responseHeaders, request);

			return new Response(JSON.stringify({ receipts: receiptsWithActions }), {
				headers: responseHeaders,
			});
		}

		// GET /api/receipts/:id - get a specific receipt
		if (url.pathname.startsWith('/api/receipts/') && !url.pathname.endsWith('/share') && request.method === 'GET') {
			const { playerId, headers: cookieHeaders } = getOrCreatePlayerId(request);
			const pathParts = url.pathname.split('/');
			const receiptId = pathParts[pathParts.length - 1];
			const doStub = getPlayerDO(env, playerId);

			const response = await doStub.fetch(new Request(`http://do/receipts/${receiptId}`, { method: 'GET' }));

			const responseHeaders = new Headers(cookieHeaders);
			responseHeaders.set('Content-Type', 'application/json');
			addCorsHeaders(responseHeaders, request);

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

		// POST /api/receipts/:id/share - create or get share link
		if (url.pathname.startsWith('/api/receipts/') && url.pathname.endsWith('/share') && request.method === 'POST') {
			const { playerId, headers: cookieHeaders } = getOrCreatePlayerId(request);
			const pathParts = url.pathname.split('/');
			const receiptId = pathParts[pathParts.length - 2]; // Get receipt id before '/share'
			const doStub = getPlayerDO(env, playerId);

			// Verify receipt exists for this player
			const receiptResponse = await doStub.fetch(new Request(`http://do/receipts/${receiptId}`, { method: 'GET' }));
			if (!receiptResponse.ok) {
				return Response.json({ error: 'Receipt not found' }, { status: 404 });
			}

			const receiptData = await receiptResponse.json<{ receipt: Receipt }>();
			const receipt = receiptData.receipt;

			// Generate token
			const token = crypto.randomUUID();

			// Create share link data
			const shareLinkData: ShareLinkData = {
				shareLink: {
					token,
					receiptId: receipt.id,
					createdAtMs: nowMs,
				},
				receipt: {
					questType: receipt.questType,
					tone: receipt.tone,
					title: receipt.title,
					line: receipt.line,
					shareText: receipt.shareText,
				},
			};

			// Store in ShareLinkDO (keyed by token)
			const shareLinkDOStub = getShareLinkDO(env, token);
			const saveResponse = await shareLinkDOStub.fetch(
				new Request('http://do/', {
					method: 'PUT',
					body: JSON.stringify(shareLinkData),
					headers: { 'Content-Type': 'application/json' },
				})
			);

			if (!saveResponse.ok) {
				return Response.json({ error: 'Failed to create share link' }, { status: 500 });
			}

			// Generate public URL
			const publicUrl = `${url.origin}/r/${token}`;

			const responseHeaders = new Headers(cookieHeaders);
			responseHeaders.set('Content-Type', 'application/json');
			addCorsHeaders(responseHeaders, request);

			return new Response(JSON.stringify({ url: publicUrl, token }), {
				headers: responseHeaders,
			});
		}

		// POST /api/quests/:id/action - record a user action for a quest
		if (url.pathname.startsWith('/api/quests/') && url.pathname.endsWith('/action') && request.method === 'POST') {
			const { playerId, headers: cookieHeaders } = getOrCreatePlayerId(request);
			const pathParts = url.pathname.split('/');
			const questId = pathParts[pathParts.length - 2]; // Get quest id before '/action'

			try {
				const body = await request.json() as { action: string };
				
				if (!body.action || typeof body.action !== 'string' || body.action.trim().length === 0) {
					return Response.json({ error: 'Action text is required' }, { status: 400 });
				}

				const doStub = getPlayerDO(env, playerId);
				
				// Create quest action
				const questAction: QuestAction = {
					id: crypto.randomUUID(),
					questId,
					action: body.action.trim(),
					createdAtMs: nowMs,
				};

				// Save to DO
				const response = await doStub.fetch(
					new Request('http://do/quest-actions', {
						method: 'POST',
						body: JSON.stringify(questAction),
						headers: { 'Content-Type': 'application/json' },
					})
				);

				if (!response.ok) {
					const errorText = await response.text();
					console.error('Failed to save quest action:', errorText);
					return Response.json({ error: 'Failed to save action' }, { status: 500 });
				}

				const responseHeaders = new Headers(cookieHeaders);
				responseHeaders.set('Content-Type', 'application/json');
				addCorsHeaders(responseHeaders, request);

				return new Response(JSON.stringify({ success: true, action: questAction }), {
					headers: responseHeaders,
				});
			} catch (error) {
				console.error('Error recording quest action:', error);
				return Response.json({ error: 'Invalid request', details: String(error) }, { status: 400 });
			}
		}

		// GET /r/:token - public share link page
		if (url.pathname.startsWith('/r/') && request.method === 'GET') {
			const pathParts = url.pathname.split('/');
			const token = pathParts[pathParts.length - 1];

			if (!token || token.length === 0) {
				return new Response('Invalid share link', { status: 404 });
			}

			// Get share link data from DO
			const shareLinkDOStub = getShareLinkDO(env, token);
			const response = await shareLinkDOStub.fetch(new Request('http://do/', { method: 'GET' }));

			if (!response.ok) {
				return new Response('Share link not found', { status: 404 });
			}

			const data = await response.json<{ data: ShareLinkData }>();
			const receipt = data.data.receipt;

			// Generate HTML page
			const html = generateReceiptPage(receipt);

			return new Response(html, {
				headers: {
					'Content-Type': 'text/html; charset=utf-8',
				},
			});
		}

		// GET / - simple health check
		if (url.pathname === '/' && request.method === 'GET') {
			return new Response('Worker alive');
		}

		return new Response('Not Found', { status: 404 });
	},
};
