/**
 * Tests for decodeJwtPayload, the one JWT payload decoder: used by the DA.live
 * token checks and storeToken, and by decodeImsUserId for the ownership gate.
 *
 * Every token is built at run time (no token-shaped literals). The decoder must
 * never throw: any input it cannot read yields null.
 */

import { decodeJwtPayload } from '@/core/utils/jwtPayload';
import { fakeJwt, fakeJwtHeaderSegment, malformedJwt } from '../../helpers/jwtFake';

/** A JSON value whose encoding needs the alphabet-specific characters (+ vs -). */
const ALPHABET_PROBE = { note: '??>?' };

/** header.payload.signature with the payload segment encoded as given. */
function tokenWithSegment(payloadSegment: string): string {
    return `${fakeJwtHeaderSegment()}.${payloadSegment}.not-a-signature`;
}

/** Encode any JSON value (object or not) as a payload segment. */
function segmentOf(value: unknown, encoding: BufferEncoding = 'base64url'): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString(encoding);
}

describe('decodeJwtPayload', () => {
    describe('readable payloads', () => {
        it('returns every claim, keeping strings as strings', () => {
            const claims = {
                email: 'user@example.com',
                client_id: 'darkalley',
                created_at: '1700000000000',
                expires_in: '86400000',
            };

            expect(decodeJwtPayload(fakeJwt(claims))).toStrictEqual(claims);
        });

        it('keeps numeric claims numeric', () => {
            const claims = { created_at: 1700000000000, expires_in: 86400000 };

            expect(decodeJwtPayload(fakeJwt(claims))).toStrictEqual(claims);
        });

        it('decodes a token with only two segments (no signature)', () => {
            const token = `${fakeJwtHeaderSegment()}.${segmentOf({ email: 'test@example.com' })}`;

            expect(decodeJwtPayload(token)).toStrictEqual({ email: 'test@example.com' });
        });

        it('decodes the URL-safe alphabet', () => {
            const segment = segmentOf(ALPHABET_PROBE, 'base64url');
            expect(segment).toContain('-'); // the probe really exercises the URL-safe character

            expect(decodeJwtPayload(tokenWithSegment(segment))).toStrictEqual(ALPHABET_PROBE);
        });

        it('decodes the standard alphabet with padding too', () => {
            const segment = segmentOf({ n: 'ÿþ?' }, 'base64');
            expect(segment).toMatch(/[+/]/);
            expect(segment).toMatch(/=$/);

            expect(decodeJwtPayload(tokenWithSegment(segment))).toStrictEqual({ n: 'ÿþ?' });
        });
    });

    describe('payloads that are JSON but not an object', () => {
        it.each([
            ['a string', 'just-a-string'],
            ['a number', 42],
            ['an array', ['user_id']],
            ['null', null],
            ['a boolean', true],
        ])('returns null when the payload is %s', (_label, value) => {
            expect(decodeJwtPayload(tokenWithSegment(segmentOf(value)))).toBeNull();
        });
    });

    describe('unreadable tokens (never throw)', () => {
        it('returns null for an empty string', () => {
            expect(decodeJwtPayload('')).toBeNull();
        });

        it('returns null for a string with no segments', () => {
            expect(decodeJwtPayload('not-a-jwt-token')).toBeNull();
        });

        it('returns null for a header segment alone', () => {
            expect(decodeJwtPayload(fakeJwtHeaderSegment())).toBeNull();
        });

        it('returns null when the payload segment is not base64', () => {
            expect(decodeJwtPayload(malformedJwt())).toBeNull();
        });

        it('returns null when the payload segment is base64 of something that is not JSON', () => {
            const segment = Buffer.from('{oops', 'utf8').toString('base64url');

            expect(decodeJwtPayload(tokenWithSegment(segment))).toBeNull();
        });

        it('returns null for an empty payload segment', () => {
            expect(decodeJwtPayload(`${fakeJwtHeaderSegment()}..not-a-signature`)).toBeNull();
        });

        it('returns null, without throwing, for arbitrary garbage', () => {
            const controlChars = String.fromCharCode(0, 1);
            const garbage = ['.', '..', '...', 'a.b', ' ', 'ey.ey.ey', 'aaa.!!!.ccc', controlChars];

            for (const input of garbage) {
                expect(() => decodeJwtPayload(input)).not.toThrow();
                expect(decodeJwtPayload(input)).toBeNull();
            }
        });
    });
});
