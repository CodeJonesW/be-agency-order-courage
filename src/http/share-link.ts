/**
 * Share link types for public receipt sharing.
 */

import type { Receipt } from './receipt';

/**
 * ShareLink: A public share link for a receipt.
 */
export interface ShareLink {
  token: string; // random, unguessable
  receiptId: string;
  createdAtMs: number;
  revoked?: boolean;
}

/**
 * ShareLinkData: Data stored with the share link (receipt content for public view).
 */
export interface ShareLinkData {
  shareLink: ShareLink;
  receipt: {
    questType: Receipt['questType'];
    tone: Receipt['tone'];
    title: Receipt['title'];
    line: Receipt['line'];
    shareText: Receipt['shareText'];
  };
}
