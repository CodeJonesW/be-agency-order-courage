/**
 * QuestAction types for storing user-recorded actions.
 */

/**
 * QuestAction: A user-recorded description of the action they took to complete a quest.
 */
export interface QuestAction {
  id: string; // UUID
  questId: string; // Associated quest ID
  action: string; // User's description of what they did
  createdAtMs: number; // When the action was recorded
}
