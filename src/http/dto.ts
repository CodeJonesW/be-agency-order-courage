/**
 * HTTP DTOs for API responses.
 *
 * These types represent the external API contract and exclude internal
 * implementation details (e.g., consequence, availability).
 */

import type { QuestId, QuestType } from '../domain/quests';

/**
 * QuestCardDTO: Read-only quest card data returned by GET /api/quests
 *
 * Excludes:
 * - consequence (internal state changes)
 * - availability (internal gating logic)
 */
export interface QuestCardDTO {
  id: QuestId;
  type: QuestType;
  context: string;
  realWorldAction: string;
  constraint: string;
  reflection?: string;
}
