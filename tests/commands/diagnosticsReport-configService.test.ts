/**
 * The Configuration Service section, leg by leg.
 *
 * Four legs answer four different questions and are reported separately on
 * purpose: whether we hold a DA.live credential at all, what the site config
 * read returned, what the SAME credential got from DA.live, and whether runtime
 * PDP self-heal can work. Collapsing any pair hides the case that only their
 * disagreement reveals — a key registered on the site that the shared action
 * cannot read means the registration never landed or the action was redeployed
 * with a different ENCRYPTION_KEY.
 *
 * Asserted as exact lines: the failure mode here is a leg that prints
 * `undefined`, or stops printing, both of which read as "nothing was wrong".
 */

import { buildSummaryLines, makeTypedReport, section } from './diagnosticsReport.testUtils';
import type { ConfigServiceProbeResult } from '@/features/eds/services/configService/configServiceProbe';

const TITLE = 'Configuration Service (site config):';
const VERDICT = 'The site config is readable.';

const linesFor = (configService: ConfigServiceProbeResult): string[] =>
    section(buildSummaryLines(makeTypedReport({ configService })), TITLE);

/** Everything after the title, minus the trailing verdict. */
const legs = (probe: ConfigServiceProbeResult): string[] => linesFor(probe).slice(1, -1);

describe('the credential gate', () => {
    // Without a credential there is nothing to ask, so every later leg would be
    // an empty box. The section says the one thing that is true and stops.
    it('stops at the credential when none is stored', () => {
        expect(
            linesFor({ token: { present: false }, verdict: 'Sign in to DA.live first.' }),
        ).toStrictEqual([TITLE, '  DA.live credential: none stored', '  → Sign in to DA.live first.']);
    });

    it('renders no read legs at all when the probe made no calls', () => {
        expect(linesFor({ token: { present: true }, verdict: VERDICT })).toStrictEqual([
            TITLE,
            `  → ${VERDICT}`,
        ]);
    });
});

describe('the two read legs', () => {
    it('prints the status, Adobe’s reason, and the invocation id it can be traced by', () => {
        expect(
            legs({
                token: { present: true },
                configService: { httpStatus: 403, xError: 'forbidden', invocationId: 'inv-42' },
                daLive: { httpStatus: 200 },
                verdict: VERDICT,
            }),
        ).toStrictEqual([
            '  Site config read: HTTP 403',
            '  x-error: forbidden',
            '  x-invocation-id: inv-42',
            // DA.live accepting what the Configuration Service refuses is the
            // signature of an authorization problem rather than a bad token.
            '  Same credential vs DA.live: HTTP 200',
        ]);
    });

    it('omits x-error and the invocation id when Adobe returned neither', () => {
        expect(
            legs({
                token: { present: true },
                configService: { httpStatus: 200 },
                daLive: { httpStatus: 200 },
                verdict: VERDICT,
            }),
        ).toStrictEqual(['  Site config read: HTTP 200', '  Same credential vs DA.live: HTTP 200']);
    });

    it('says unreachable rather than a status when the call never landed', () => {
        expect(
            legs({
                token: { present: true },
                configService: { error: 'ENOTFOUND' },
                daLive: { error: 'timed out' },
                verdict: VERDICT,
            }),
        ).toStrictEqual([
            '  Site config read: unreachable (ENOTFOUND)',
            '  Same credential vs DA.live: unreachable (timed out)',
        ]);
    });
});

/**
 * A site with any `access.admin` role closes the Helix admin API to anonymous
 * callers, and the smart-404 publisher runs in the VISITOR's browser, which
 * holds no credential. `locked && keyCount === 0` therefore means every product
 * added after setup 404s on first visit — silent everywhere else.
 */
describe('runtime PDP publishing', () => {
    const withPdp = (pdpPublishing: ConfigServiceProbeResult['pdpPublishing']): string[] =>
        legs({ token: { present: true }, pdpPublishing, verdict: VERDICT });

    it('is OK on an unlocked site — anonymous publishing needs no key', () => {
        expect(withPdp({ locked: false })).toStrictEqual([
            '  Runtime PDP publishing: OK (site admin API is open)',
        ]);
    });

    it('counts the keys on a locked site', () => {
        expect(withPdp({ locked: true, keyCount: 2 })).toStrictEqual([
            '  Runtime PDP publishing: OK (admin-locked, 2 publish key(s) registered)',
        ]);
    });

    it('names the consequence and the remedy when a locked site holds no key', () => {
        expect(withPdp({ locked: true, keyCount: 0 })).toStrictEqual([
            '  Runtime PDP publishing: BROKEN — site is admin-locked with no publish key.',
            '    Products added after setup will 404 on first visit. Fix: run ' +
                '"Demo Builder: Repair Site Configuration" to re-register a key.',
        ]);
    });

    // Unreadable is not zero. Reporting it as BROKEN would send someone to
    // re-register a key that may well already be there.
    it('says the count is unreadable rather than assuming there is none', () => {
        expect(withPdp({ locked: true })).toStrictEqual([
            '  Runtime PDP publishing: site is admin-locked; key count unreadable',
        ]);
    });

    it('says it could not determine anything when the leg itself failed', () => {
        expect(withPdp({ locked: true, keyCount: 1, error: 'HTTP 500' })).toStrictEqual([
            '  Runtime PDP publishing: could not determine (HTTP 500)',
        ]);
    });
});

describe('the shared PDP action', () => {
    const actionLines = (actionKey: NonNullable<ConfigServiceProbeResult['pdpPublishing']>['actionKey']): string[] =>
        legs({
            token: { present: true },
            pdpPublishing: { locked: false, actionKey },
            verdict: VERDICT,
        }).slice(1);

    // Silent when BYOM is off: a line about a feature the user has not enabled
    // is noise in a report meant for tickets.
    it('says nothing when there is no action to ask', () => {
        expect(actionLines(undefined)).toStrictEqual([]);
    });

    it('reports a readable key as OK', () => {
        expect(actionLines({ registered: true })).toStrictEqual([
            '  Shared PDP action: OK (holds a readable key for this site)',
        ]);
    });

    it('names both causes when the action holds no readable key', () => {
        expect(actionLines({ registered: false })).toStrictEqual([
            '  Shared PDP action: BROKEN — it holds no readable key for this site.',
            '    Either the registration never landed, or the action was redeployed with a ' +
                'different ENCRYPTION_KEY, which makes every previously stored key unreadable.',
            '    Fix: run "Demo Builder: Repair Site Configuration". If that does not help, ' +
                'the deployed ENCRYPTION_KEY no longer matches the one the keys were written with.',
        ]);
    });

    // "Not registered" would send someone to re-register a key that is probably
    // fine, and bury the fact that the service never answered at all.
    it('does not call an unreachable action "no key"', () => {
        expect(actionLines({ error: 'HTTP 503' })).toStrictEqual([
            '  Shared PDP action: could not be reached (HTTP 503)',
        ]);
    });
});

/**
 * Who can grant. "Ask an admin" is unactionable without a name, and addresses
 * are MASKED because this report is written to be pasted into tickets.
 */
describe('the org admin roster', () => {
    const adminLine = (orgAdmins: ConfigServiceProbeResult['orgAdmins']): string[] =>
        legs({ token: { present: true }, orgAdmins, verdict: VERDICT });

    it('masks every address it names', () => {
        expect(adminLine({ status: 'ok', emails: ['owner@adobe.com', 'jo@adobe.com'] })).toStrictEqual([
            '  Config admins: o****r@adobe.com, j****@adobe.com',
        ]);
    });

    // An empty list reads as "this org has no admins" — a different and much
    // scarier claim than "you cannot see them".
    it('never prints an empty list', () => {
        expect(adminLine({ status: 'ok', emails: [] })).toStrictEqual([
            '  Config admins: none listed on this org',
        ]);
        expect(adminLine({ status: 'ok' })).toStrictEqual([
            '  Config admins: none listed on this org',
        ]);
    });

    // Leah's shape: the roster's own refusal is the finding. Nobody is visible
    // to ask, which makes the Code Sync setup flow the only remaining path.
    it('reports a refused roster as unreadable', () => {
        expect(adminLine({ status: 'not_authorized' })).toStrictEqual([
            '  Config admins: not readable (403) — no admin is visible to ask',
        ]);
    });

    it('distinguishes a failed read from a refused one', () => {
        expect(adminLine({ status: 'failed' })).toStrictEqual(['  Config admins: roster read failed']);
    });

    // CONTROL for the three above: no roster leg means no admin line at all,
    // so their presence is a property of the status and not of the section.
    it('CONTROL — prints no admin line when the roster was never read', () => {
        expect(adminLine(undefined)).toStrictEqual([]);
    });
});
