/**
 * sha256 — the one content fingerprint, used wherever Demo Builder records what it wrote and
 * later asks whether it is still there as written (datapack-engine step 04).
 */

import { createHash } from 'crypto';
import { sha256 } from '@/core/utils/sha256';

describe('sha256', () => {
    it.each([
        // Published SHA-256 test vectors (FIPS 180-2 "abc"; the empty string).
        ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
        ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ])('hashes %j to its lowercase hex digest', (text, digest) => {
        expect(sha256(text)).toBe(digest);
    });

    it('hashes the utf-8 bytes of the text', () => {
        // "é" is the two utf-8 bytes c3 a9; a latin1 encoding would hash the one byte e9.
        const utf8 = createHash('sha256').update(Buffer.from([0xc3, 0xa9])).digest('hex');
        const latin1 = createHash('sha256').update(Buffer.from([0xe9])).digest('hex');
        expect(sha256('é')).toBe(utf8);
        expect(sha256('é')).not.toBe(latin1);
    });

    it('tells one character of difference apart', () => {
        expect(sha256('<body>ours</body>')).not.toBe(sha256('<body>ours</body> '));
    });
});
