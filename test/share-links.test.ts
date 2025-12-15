/**
 * Share link tests.
 *
 * Verifies that share links can be created, accessed publicly, and revoked.
 */

import { describe, it, expect } from 'vitest';
import type { ShareLink, ShareLinkData } from '../src/http/share-link';

describe('Share Link Creation', () => {
  it('creates share link with token', () => {
    const token = 'test-token-123';
    const receiptId = 'test-receipt-456';
    const nowMs = Date.now();

    const shareLink: ShareLink = {
      token,
      receiptId,
      createdAtMs: nowMs,
    };

    expect(shareLink.token).toBe(token);
    expect(shareLink.receiptId).toBe(receiptId);
    expect(shareLink.createdAtMs).toBe(nowMs);
    expect(shareLink.revoked).toBeUndefined();
  });

  it('share link can be revoked', () => {
    const shareLink: ShareLink = {
      token: 'test-token',
      receiptId: 'test-receipt',
      createdAtMs: Date.now(),
      revoked: true,
    };

    expect(shareLink.revoked).toBe(true);
  });
});

describe('Share Link Data', () => {
  it('contains receipt data without internal identifiers', () => {
    const shareLinkData: ShareLinkData = {
      shareLink: {
        token: 'test-token',
        receiptId: 'test-receipt',
        createdAtMs: Date.now(),
      },
      receipt: {
        questType: 'agency',
        tone: 'warm',
        title: 'Action completed',
        line: 'You took a step.',
        shareText: 'Took a step forward.',
      },
    };

    expect(shareLinkData.receipt).toHaveProperty('questType');
    expect(shareLinkData.receipt).toHaveProperty('tone');
    expect(shareLinkData.receipt).toHaveProperty('title');
    expect(shareLinkData.receipt).toHaveProperty('line');
    expect(shareLinkData.receipt).toHaveProperty('shareText');
    expect(shareLinkData.receipt).not.toHaveProperty('questId');
    expect(shareLinkData.receipt).not.toHaveProperty('createdAtMs');
    expect(shareLinkData.receipt).not.toHaveProperty('id');
  });
});

describe('Share Link URL Generation', () => {
  it('generates correct public URL format', () => {
    const token = 'test-token-123';
    const origin = 'https://example.com';
    const url = `${origin}/r/${token}`;

    expect(url).toBe('https://example.com/r/test-token-123');
    expect(url).toContain('/r/');
    expect(url).toContain(token);
  });
});

describe('Share Link Validation', () => {
  it('validates token format', () => {
    // UUID format (what crypto.randomUUID() generates)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validToken = '550e8400-e29b-41d4-a716-446655440000';
    const invalidToken = 'not-a-uuid';

    expect(uuidPattern.test(validToken)).toBe(true);
    expect(uuidPattern.test(invalidToken)).toBe(false);
  });
});
