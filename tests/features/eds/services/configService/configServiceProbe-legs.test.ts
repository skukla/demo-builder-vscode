/**
 * configServiceProbe — the legs, one disagreement at a time.
 *
 * The sibling suite covers the probe's headline cases. This one drives each leg
 * to an answer the others do not share, because that is where the probe earns
 * its keep: the verdict is chosen from a combination, and a stub that answers
 * every host the same way cannot tell one combination from another.
 *
 * Verdicts are asserted WHOLE. A `toMatch(/install/)` passes for four different
 * verdicts, which is how the roster branches went unconstrained.
 */

import {
    CREDENTIAL_VALID_BASE,
    logger,
    mockResolveOverlayUrl,
    ORG,
    probeConfigService,
    rosterOf,
    routedFetch,
    SITE,
    tokenProvider,
    type ProbeLegs,
} from './configServiceProbe.testUtils';

describe('probeConfigService — legs', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
        jest.clearAllMocks();
        originalFetch = globalThis.fetch;
        mockResolveOverlayUrl.mockReturnValue(undefined);
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    const run = (legs: ProbeLegs = {}) => {
        globalThis.fetch = routedFetch(legs) as unknown as typeof globalThis.fetch;
        return probeConfigService(tokenProvider(), ORG, SITE, logger);
    };

    describe('reading the config response', () => {
        it('records a present credential without the token itself', async () => {
            const result = await run();

            expect(result.token).toEqual({ present: true });
        });

        it('reports absent headers as absent diagnostics, not as a crash', async () => {
            // A response object with no `headers` at all — the probe must still
            // report the status it got rather than fail the whole leg.
            const result = await run({ config: { status: 200, noHeaders: true } });

            expect(result.configService).toEqual({
                httpStatus: 200,
                xError: undefined,
                invocationId: undefined,
            });
        });

        it('survives a headers object that carries no get()', async () => {
            const result = await run({ config: { status: 200, headersWithoutGet: true } });

            expect(result.configService).toEqual({
                httpStatus: 200,
                xError: undefined,
                invocationId: undefined,
            });
        });

        it('reports an unreachable Configuration Service as its own leg failure', async () => {
            const result = await run({ config: { reject: 'ECONNREFUSED' } });

            expect(result.configService).toEqual({ error: 'ECONNREFUSED' });
            expect(result.verdict).toBe(
                'Could not reach the Configuration Service (ECONNREFUSED). ' +
                    'Nothing can be concluded about permissions from this run.',
            );
        });
    });

    describe('choosing a verdict', () => {
        it('separates a refusal everywhere from a refusal only here', async () => {
            // DA.live refuses the same credential, so nothing points at the
            // admin role — this is a sign-in problem, not an authorization one.
            const result = await run({ config: { status: 403 }, daLive: { status: 403 } });

            expect(result.verdict).toBe(
                'The Configuration Service refused this credential, and DA.live did not accept ' +
                    'it either. Sign in again, then re-run this probe — if it still refuses, the ' +
                    'account lacks access to this org.',
            );
        });

        it('states an unhandled status verbatim rather than guessing', async () => {
            const result = await run({ config: { status: 500 } });

            expect(result.verdict).toBe(
                'The Configuration Service returned HTTP 500. ' +
                    'Nothing decisive — include the invocation ID above when reporting this.',
            );
        });
    });

    describe('naming the org admins', () => {
        const refused: ProbeLegs = { config: { status: 403 }, daLive: { status: 200 } };

        it('names a single admin with no overflow note', async () => {
            const result = await run({
                ...refused,
                roster: { status: 200, body: rosterOf('owner@example.test') },
            });

            expect(result.orgAdmins).toEqual({ status: 'ok', emails: ['owner@example.test'] });
            expect(result.verdict).toBe(
                `${CREDENTIAL_VALID_BASE}Ask an org admin to add you under Site users: ` +
                    'o****r@example.test.',
            );
        });

        it('names exactly three admins with no overflow note', async () => {
            // The boundary: three fit, so the "(+N more)" tail must not appear.
            const result = await run({
                ...refused,
                roster: {
                    status: 200,
                    body: rosterOf('one@example.test', 'two@example.test', 'six@example.test'),
                },
            });

            expect(result.verdict).toBe(
                `${CREDENTIAL_VALID_BASE}Ask an org admin to add you under Site users: ` +
                    'o****e@example.test, t****o@example.test, s****x@example.test.',
            );
        });

        it('caps the list at three and counts the rest', async () => {
            const result = await run({
                ...refused,
                roster: {
                    status: 200,
                    body: rosterOf(
                        'one@example.test',
                        'two@example.test',
                        'six@example.test',
                        'ten@example.test',
                        'sky@example.test',
                    ),
                },
            });

            expect(result.verdict).toBe(
                `${CREDENTIAL_VALID_BASE}Ask an org admin to add you under Site users: ` +
                    'o****e@example.test, t****o@example.test, s****x@example.test (+2 more).',
            );
        });

        it('treats a readable but empty roster as nobody to ask', async () => {
            // Readable and empty is not the same as unreadable, but the remedy
            // is: there is no admin to name either way.
            const result = await run({ ...refused, roster: { status: 200, body: rosterOf() } });

            expect(result.orgAdmins).toEqual({ status: 'ok', emails: [] });
            expect(result.verdict).toBe(
                `${CREDENTIAL_VALID_BASE}No org admin is visible either — open ` +
                    'tools.aem.live/bot/setup for this site and add your email under Site users, ' +
                    'then re-run this probe.',
            );
        });

        it('distinguishes a failed roster read from a refused one', async () => {
            // 500 is not 403: "failed" may be retried, "not_authorized" cannot.
            const result = await run({ ...refused, roster: { status: 500 } });

            expect(result.orgAdmins).toEqual({ status: 'failed' });
        });
    });

    describe('the runtime-PDP leg', () => {
        it('reports a locked site and counts the keys registered on it', async () => {
            const result = await run({
                access: { status: 200 },
                apiKeys: { status: 200, body: { 'key-a': {}, 'key-b': {} } },
            });

            expect(result.pdpPublishing).toEqual({
                locked: true,
                keyCount: 2,
                actionKey: undefined,
            });
        });

        it('reads an absent access doc as unlocked and an absent key doc as zero', async () => {
            const result = await run({ access: { status: 404 }, apiKeys: { status: 404 } });

            expect(result.pdpPublishing).toEqual({
                locked: false,
                keyCount: 0,
                actionKey: undefined,
            });
        });

        it('leaves the key count unknown when the key doc is refused', async () => {
            // Refused is not zero. Reporting zero here would claim every new
            // product 404s on first visit, for a site whose keys we cannot see.
            const result = await run({ access: { status: 404 }, apiKeys: { status: 403 } });

            expect(result.pdpPublishing).toEqual({
                locked: false,
                keyCount: undefined,
                actionKey: undefined,
            });
        });

        it('reports the whole leg as failed when the access read throws', async () => {
            const result = await run({ access: { reject: 'socket hang up' } });

            expect(result.pdpPublishing).toEqual({ locked: false, error: 'socket hang up' });
        });
    });

    describe('the action-key leg', () => {
        it('asks nothing and reports nothing when BYOM is off', async () => {
            mockResolveOverlayUrl.mockReturnValue(undefined);

            const result = await run({ access: { status: 404 }, apiKeys: { status: 404 } });

            expect(result.pdpPublishing).toEqual({
                locked: false,
                keyCount: 0,
                actionKey: undefined,
            });
        });

        it('asks nothing when the overlay URL is not one it can derive from', async () => {
            // A misconfigured setting must not build a request to an arbitrary host.
            mockResolveOverlayUrl.mockReturnValue('https://example.test/api/v1/web/pkg/something');

            const result = await run({ access: { status: 404 }, apiKeys: { status: 404 } });

            expect(result.pdpPublishing).toEqual({
                locked: false,
                keyCount: 0,
                actionKey: undefined,
            });
        });

        it('reads a body with no registered field as not registered', async () => {
            mockResolveOverlayUrl.mockReturnValue(
                'https://ns.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp',
            );

            const result = await run({ action: { status: 200, body: undefined } });

            expect(result.pdpPublishing?.actionKey).toEqual({ registered: false });
        });
    });
});
