/**
 * TokenManager — inspectToken single-flight
 *
 * Concurrent callers collapse into ONE read. There are 8 `isAuthenticated()`
 * call sites across the dashboard/creation handlers, and the inspection CACHE
 * only helps callers arriving AFTER a read completes — on a cold cache they all
 * check, all miss, and all read.
 *
 * **The stakes dropped, and the guard stayed.** This was written when the read
 * spawned the whole `aio` Node CLI (MEASURED 2.05s), so a stampede cost seconds
 * per extra caller; the read is now in-process and sub-millisecond. It is kept
 * because it is still correct and costs nothing, not because it still saves
 * seconds — do not restore the old "~3.7s each" framing, which stopped being
 * true when the subprocess went away.
 */

import { TokenManager, type StoredTokenConfig } from '@/features/authentication/services/tokenManager';

/** A valid entry: >100 chars and an expiry comfortably in the future. */
function tokenPayload(): StoredTokenConfig {
    return { token: 'x'.repeat(150), expiry: Date.now() + 3_600_000 };
}

describe('TokenManager — inspectToken single-flight', () => {
    let tokenManager: TokenManager;
    let reads: number;

    beforeEach(() => {
        reads = 0;
        tokenManager = new TokenManager(undefined, undefined, () => {
            reads += 1;
            return tokenPayload();
        });
    });

    it('collapses concurrent callers into ONE read', async () => {
        const a = tokenManager.inspectToken();
        const b = tokenManager.inspectToken();
        const c = tokenManager.inspectToken();

        const [ra, rb, rc] = await Promise.all([a, b, c]);

        expect(reads).toBe(1);
        expect(ra.valid).toBe(true);
        expect(rb).toEqual(ra);
        expect(rc).toEqual(ra);
    });

    it('isTokenValid rides the same flight', async () => {
        const a = tokenManager.inspectToken();
        const b = tokenManager.isTokenValid();

        const [inspection, valid] = await Promise.all([a, b]);

        expect(reads).toBe(1);
        expect(inspection.valid).toBe(true);
        expect(valid).toBe(true);
    });

    /**
     * CONTROL. The flight must RELEASE — otherwise the test above would also pass
     * against an implementation that reads once and never again, which would pin
     * a token permanently and survive no re-authentication.
     */
    it('releases the flight so a LATER call reads again', async () => {
        await tokenManager.inspectToken();
        await tokenManager.inspectToken();

        expect(reads).toBe(2);
    });
});
