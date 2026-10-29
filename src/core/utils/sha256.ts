/**
 * The one content fingerprint: sha-256 of a text's utf-8 bytes, as lowercase hex.
 *
 * Demo Builder records this when it writes something (an AI-bundle file, a DA.live page) and
 * compares it later to tell "still as we left it" from "changed since" (`ownedChange.ts`). It was
 * written out three times before (datapack-engine step 04); every recorded hash in an existing
 * project was made this way, so the encoding and digest format must never change.
 *
 * @module core/utils/sha256
 */

import { createHash } from 'crypto';

/**
 * Fingerprint a text.
 *
 * @param text - the content, hashed as utf-8
 * @returns the 64-character lowercase hex digest
 */
export function sha256(text: string): string {
    return createHash('sha256').update(text, 'utf-8').digest('hex');
}
