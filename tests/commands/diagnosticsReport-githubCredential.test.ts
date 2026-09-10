/**
 * The GitHub / AEM credential section, line by line.
 *
 * This section is a triangulation: who we are signed in as, what GitHub says
 * about write access to the project's repo, and what AEM's admin API says to the
 * SAME credential. No single leg is decisive — `push: true` beside an AEM 401
 * rules out both scope and permission and leaves the credential itself — so what
 * matters is that each leg appears, and appears as the thing it actually is.
 *
 * Asserted with `toStrictEqual` on the section's lines rather than `toContain`:
 * a leg that silently stops printing, or prints `undefined`, is the failure mode
 * here, and a substring check passes through both.
 */

import { buildSummaryLines, makeTypedReport, section } from './diagnosticsReport.testUtils';
import type { CredentialProbeResult } from '@/features/eds/services/github/githubCredentialProbe';

const TITLE = 'GitHub / AEM credential:';
const VERDICT = 'Not a scope or permission problem — AEM is refusing the credential itself.';

const linesFor = (githubCredential: CredentialProbeResult): string[] =>
    section(buildSummaryLines(makeTypedReport({ githubCredential })), TITLE);

describe('the credential section', () => {
    it('prints every leg it has, verdict last', () => {
        expect(
            linesFor({
                github: {
                    reachable: true,
                    login: 'skukla',
                    tokenType: 'gho_',
                    grantedScopes: ['repo', 'workflow'],
                },
                repo: { fullName: 'acme/storefront', canPush: true },
                adminApi: { httpStatus: 401, codeStatus: 401, xError: '[admin] not authenticated' },
                verdict: VERDICT,
            }),
        ).toStrictEqual([
            TITLE,
            '  Signed in as: skukla',
            '  Credential type: gho_',
            '  Granted scopes: repo, workflow',
            '  Write access to acme/storefront: Yes',
            '  AEM admin API: HTTP 401, code.status 401, x-error: [admin] not authenticated',
            `  → ${VERDICT}`,
        ]);
    });

    // The control for the test above: with nothing but a verdict, every optional
    // leg must be ABSENT rather than printed empty. "Signed in as: undefined"
    // reads as a broken session; "not signed in" is the actual state.
    it('says "not signed in" and prints no leg it does not have', () => {
        expect(linesFor({ github: { reachable: false }, verdict: 'Not signed in to GitHub.' })).toStrictEqual([
            TITLE,
            '  Signed in as: not signed in',
            '  → Not signed in to GitHub.',
        ]);
    });
});

describe('write access', () => {
    const withRepo = (repo: CredentialProbeResult['repo']): string[] =>
        linesFor({ github: { reachable: true, login: 'skukla' }, repo, verdict: VERDICT });

    it('says No when GitHub denies push', () => {
        expect(withRepo({ fullName: 'acme/storefront', canPush: false })).toStrictEqual([
            TITLE,
            '  Signed in as: skukla',
            '  Write access to acme/storefront: No',
            `  → ${VERDICT}`,
        ]);
    });

    // No answer is not the same as "No". When GitHub refused to answer, the
    // refusal is the more useful line — it says where to look.
    it('carries GitHub’s own error when there is no push answer', () => {
        expect(withRepo({ fullName: 'acme/storefront', error: 'HTTP 404' })).toStrictEqual([
            TITLE,
            '  Signed in as: skukla',
            '  Write access to acme/storefront: HTTP 404',
            `  → ${VERDICT}`,
        ]);
    });

    it('falls back to "unknown" when there is neither an answer nor an error', () => {
        expect(withRepo({ fullName: 'acme/storefront' })).toStrictEqual([
            TITLE,
            '  Signed in as: skukla',
            '  Write access to acme/storefront: unknown',
            `  → ${VERDICT}`,
        ]);
    });
});

describe('the AEM admin API leg', () => {
    const withAdmin = (adminApi: CredentialProbeResult['adminApi']): string =>
        linesFor({ github: { reachable: true, login: 'skukla' }, adminApi, verdict: VERDICT })[2];

    it('reports the transport error alone when the call never landed', () => {
        expect(withAdmin({ error: 'fetch failed' })).toBe('  AEM admin API: fetch failed');
    });

    it('prints only the fields AEM actually returned', () => {
        expect(withAdmin({ httpStatus: 200 })).toBe('  AEM admin API: HTTP 200');
        expect(withAdmin({ codeStatus: 404 })).toBe('  AEM admin API: code.status 404');
        expect(withAdmin({ xError: 'no site' })).toBe('  AEM admin API: x-error: no site');
    });

    // An answer with no fields is a response, not a missing one — and a bare
    // empty line here would read as "AEM said nothing was wrong".
    it('says "no response" when AEM returned nothing to report', () => {
        expect(withAdmin({})).toBe('  AEM admin API: no response');
    });
});
