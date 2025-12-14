/**
 * UUID generation utility for Cloudflare Workers.
 *
 * Generates a random UUID v4 compatible string.
 * Uses crypto.randomUUID() if available, otherwise falls back to manual generation.
 */

/**
 * Generates a random UUID v4.
 */
export function generateUUID(): string {
  // Use crypto.randomUUID() if available (Cloudflare Workers supports it)
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  // Fallback: manual UUID v4 generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
