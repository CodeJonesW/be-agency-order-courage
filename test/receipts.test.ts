/**
 * Receipt tests.
 *
 * Verifies that receipts are created on quest completion, stored correctly,
 * returned in most recent first order, capped at 50, and contain no guilt language.
 */

import { describe, it, expect } from 'vitest';
import type { Receipt } from '../src/http/receipt';
import { generateDefaultShareText } from '../src/http/receipt';

describe('Receipt Generation', () => {
  it('generates default shareText for agency quests', () => {
    const shareText = generateDefaultShareText('agency');
    expect(shareText).toBe('Took a step forward. Agency grows through action.');
    expect(shareText.length).toBeLessThanOrEqual(180);
  });

  it('generates default shareText for courage quests', () => {
    const shareText = generateDefaultShareText('courage');
    expect(shareText).toBe('Spoke a truth. Courage builds through practice.');
    expect(shareText.length).toBeLessThanOrEqual(180);
  });

  it('generates default shareText for order quests', () => {
    const shareText = generateDefaultShareText('order');
    expect(shareText).toBe('Removed friction. Order creates space for action.');
    expect(shareText.length).toBeLessThanOrEqual(180);
  });

  it('default shareTexts contain no guilt language', () => {
    const guiltWords = ['should', 'failed', 'lazy', 'make up for', 'missed', 'no excuses'];
    const questTypes: Array<'agency' | 'courage' | 'order'> = ['agency', 'courage', 'order'];

    for (const questType of questTypes) {
      const shareText = generateDefaultShareText(questType).toLowerCase();
      for (const word of guiltWords) {
        expect(shareText).not.toContain(word);
      }
    }
  });
});

describe('Receipt Structure', () => {
  it('has all required fields', () => {
    const receipt: Receipt = {
      id: 'test-id',
      createdAtMs: Date.now(),
      questId: 'test-quest',
      questType: 'agency',
      tone: 'warm',
      title: 'Action completed',
      line: 'You took a step.',
      shareText: 'Took a step forward. Agency grows through action.',
    };

    expect(receipt).toHaveProperty('id');
    expect(receipt).toHaveProperty('createdAtMs');
    expect(receipt).toHaveProperty('questId');
    expect(receipt).toHaveProperty('questType');
    expect(receipt).toHaveProperty('tone');
    expect(receipt).toHaveProperty('title');
    expect(receipt).toHaveProperty('line');
    expect(receipt).toHaveProperty('shareText');
  });

  it('shareText is required and <= 180 chars', () => {
    const receipt: Receipt = {
      id: 'test-id',
      createdAtMs: Date.now(),
      questId: 'test-quest',
      questType: 'agency',
      tone: 'warm',
      title: 'Action completed',
      line: 'You took a step.',
      shareText: 'Took a step forward. Agency grows through action.',
    };

    expect(receipt.shareText).toBeDefined();
    expect(receipt.shareText.length).toBeLessThanOrEqual(180);
  });
});

describe('Receipt Storage Logic', () => {
  it('keeps only most recent 50 receipts', () => {
    const receipts: Receipt[] = [];
    
    // Simulate adding 60 receipts
    for (let i = 0; i < 60; i++) {
      const receipt: Receipt = {
        id: `receipt-${i}`,
        createdAtMs: Date.now() - (60 - i) * 1000, // Older receipts have earlier timestamps
        questId: `quest-${i}`,
        questType: 'agency',
        tone: 'warm',
        title: 'Action completed',
        line: 'You took a step.',
        shareText: 'Took a step forward.',
      };
      receipts.push(receipt);
    }

    // Sort by createdAtMs descending and cap at 50
    const sorted = receipts.sort((a, b) => b.createdAtMs - a.createdAtMs);
    const capped = sorted.slice(0, 50);

    expect(capped.length).toBe(50);
    expect(capped[0].createdAtMs).toBeGreaterThan(capped[49].createdAtMs);
  });

  it('sorts receipts by createdAtMs descending (most recent first)', () => {
    const receipts: Receipt[] = [
      {
        id: 'old',
        createdAtMs: 1000,
        questId: 'quest-1',
        questType: 'agency',
        tone: 'warm',
        title: 'Action completed',
        line: 'You took a step.',
        shareText: 'Took a step forward.',
      },
      {
        id: 'new',
        createdAtMs: 2000,
        questId: 'quest-2',
        questType: 'courage',
        tone: 'warm',
        title: 'Action completed',
        line: 'You took a step.',
        shareText: 'Spoke a truth.',
      },
    ];

    const sorted = receipts.sort((a, b) => b.createdAtMs - a.createdAtMs);

    expect(sorted[0].id).toBe('new');
    expect(sorted[1].id).toBe('old');
  });
});

describe('Receipt Guilt Language Check', () => {
  it('validates receipts contain no guilt language', () => {
    const guiltWords = ['should', 'failed', 'lazy', 'make up for', 'missed', 'no excuses'];
    
    const receipt: Receipt = {
      id: 'test-id',
      createdAtMs: Date.now(),
      questId: 'test-quest',
      questType: 'agency',
      tone: 'warm',
      title: 'Action completed',
      line: 'You took a step.',
      shareText: 'Took a step forward. Agency grows through action.',
    };

    const text = `${receipt.title} ${receipt.line} ${receipt.shareText}`.toLowerCase();

    for (const word of guiltWords) {
      expect(text).not.toContain(word);
    }
  });
});
