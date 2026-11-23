/**
 * The sign-ins Adobe has turned away (walk F247): a token Adobe answered "Oauth token is not
 * valid" for, though it had hours left, stays turned away until a new one replaces it.
 */

import { RejectedTokens } from '@/features/authentication/services/rejectedTokens';

const TOKEN = 'eyJ'.padEnd(150, 'a');
const NEW_TOKEN = 'eyJ'.padEnd(150, 'b');

describe('RejectedTokens', () => {
    it('knows a token once Adobe turned it away, and a new token is not turned away', () => {
        const rejected = new RejectedTokens();
        expect(rejected.has(TOKEN)).toBe(false);

        rejected.mark(TOKEN);

        expect(rejected.has(TOKEN)).toBe(true);
        expect(rejected.has(NEW_TOKEN)).toBe(false);
    });

    it('never holds the token itself, only a fingerprint of it', () => {
        const rejected = new RejectedTokens();
        rejected.mark(TOKEN);

        expect(JSON.stringify(rejected)).not.toContain(TOKEN);
    });
});
