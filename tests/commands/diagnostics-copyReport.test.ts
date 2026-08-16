/**
 * Diagnostics — copyable report
 *
 * Getting a diagnostic report out of a colleague's machine has cost a
 * round-trip every time. The existing paths are "Export Log" (a file to find,
 * save, and email) or select-all in the output channel, which copies EVERY run
 * in the session — that is how a report arrives at 45 KB with a duplicated
 * section in the middle.
 *
 * A "Copy Report" action on the completion notification hands them the current
 * run, curated, in one click.
 *
 * The summary is safe to paste by construction: the credential section prints a
 * login, a credential TYPE prefix, granted scopes, a boolean, status codes, and
 * Adobe's x-error — never the token. The leak guard below is what keeps that
 * true as the summary grows.
 */

import * as vscode from 'vscode';
import {
    browserProbeCommand,
    buildSummaryLines,
    runDiagnosticsAction,
} from '@/commands/diagnostics';
import type { DiagnosticsReport } from '@/commands/diagnostics';

const TOKEN = 'gho_SUPERSECRETVALUE0000000000000000000';

function makeReport(overrides: Partial<DiagnosticsReport> = {}): DiagnosticsReport {
    return {
        timestamp: '2026-07-29T00:00:00Z',
        system: { platform: 'darwin', release: '25.5.0' },
        vscode: { version: '1.99.0' },
        tools: {
            node: { installed: true, output: 'v22.0.0', duration: 1 },
            git: { installed: false, duration: 1 },
        },
        adobe: { installed: true, version: '11.0.1', authConfigured: true, tokenExpired: false },
        environment: {},
        tests: {
            browserLaunch: { available: true },
            adobeLoginCommand: { available: true },
            fileSystem: { canWrite: true },
        },
        mcp: { running: true, tools: ['sign_in'], hasSignIn: true },
        githubCredential: {
            github: {
                reachable: true,
                login: 'skukla',
                tokenType: 'gho_',
                grantedScopes: ['repo', 'workflow'],
            },
            repo: { fullName: 'owner/repo', canPush: true },
            adminApi: { httpStatus: 401, xError: '[admin] not authenticated' },
            verdict: 'Not a scope or permission problem — AEM is refusing the credential itself.',
        },
        ...overrides,
    } as unknown as DiagnosticsReport;
}

describe('buildSummaryLines', () => {
    it('produces the whole summary as lines', () => {
        const text = buildSummaryLines(makeReport()).join('\n');

        expect(text).toContain('DIAGNOSTICS SUMMARY');
        expect(text).toContain('Tools Status:');
        expect(text).toContain('Adobe CLI Status:');
        expect(text).toContain('Diagnostic Tests:');
        expect(text).toContain('MCP Server (in-extension):');
        expect(text).toContain('GitHub / AEM credential:');
    });

    it('ends the credential section with the verdict', () => {
        const lines = buildSummaryLines(makeReport());
        const verdict = lines.findIndex((l) => l.startsWith('  → '));
        const admin = lines.findIndex((l) => l.includes('AEM admin API:'));

        expect(verdict).toBeGreaterThan(admin);
    });

    it('carries the credential type but never the credential', () => {
        // This is the property that makes the report safe to paste into a
        // ticket. If it ever breaks, the copy button becomes a leak.
        const text = buildSummaryLines(makeReport()).join('\n');

        expect(text).toContain('gho_');
        expect(text).not.toContain(TOKEN);
        expect(text).not.toMatch(/gho_[A-Za-z0-9]/);
    });

    // The combination "admin-locked with no publish key" is silent everywhere
    // else: it surfaces days later as "some product pages don't work", with
    // nothing tying it back to the admin grant that caused it. The report is
    // where that becomes visible on demand, so pin the verdict AND the remedy.
    it('calls runtime PDP publishing BROKEN when the site is locked with no key', () => {
        const report = makeReport({
            configService: {
                token: { present: true },
                configService: { httpStatus: 200 },
                pdpPublishing: { locked: true, keyCount: 0 },
                verdict: 'ok',
            },
        } as Partial<DiagnosticsReport>);

        const text = buildSummaryLines(report).join('\n');
        expect(text).toContain('Runtime PDP publishing: BROKEN');
        expect(text).toMatch(/404 on first visit/);
        expect(text).toContain('Repair Site Configuration');
    });

    it('calls runtime PDP publishing OK when a key is registered', () => {
        const report = makeReport({
            configService: {
                token: { present: true },
                configService: { httpStatus: 200 },
                pdpPublishing: { locked: true, keyCount: 1 },
                verdict: 'ok',
            },
        } as Partial<DiagnosticsReport>);

        const text = buildSummaryLines(report).join('\n');
        expect(text).toContain('Runtime PDP publishing: OK');
        expect(text).not.toContain('BROKEN');
    });

    // An unlocked site publishes anonymously, so no key is needed and its
    // absence is not a finding.
    it('does not report a problem when the site is not admin-locked', () => {
        const report = makeReport({
            configService: {
                token: { present: true },
                configService: { httpStatus: 200 },
                pdpPublishing: { locked: false, keyCount: 0 },
                verdict: 'ok',
            },
        } as Partial<DiagnosticsReport>);

        const text = buildSummaryLines(report).join('\n');
        expect(text).toContain('Runtime PDP publishing: OK (site admin API is open)');
        expect(text).not.toContain('BROKEN');
    });

    // The site half and the action half can disagree, and the disagreement IS the
    // diagnosis. A site holding a key that the action cannot read means either the
    // registration never landed or the action was redeployed with a different
    // ENCRYPTION_KEY — the one failure mode no other check in this report sees.
    it('reports the action separately from the site, and names the encryption-key cause', () => {
        const report = makeReport({
            configService: {
                token: { present: true },
                configService: { httpStatus: 200 },
                pdpPublishing: { locked: true, keyCount: 1, actionKey: { registered: false } },
                verdict: 'ok',
            },
        } as Partial<DiagnosticsReport>);

        const text = buildSummaryLines(report).join('\n');
        // The site half still reads OK — one key IS registered on the site.
        expect(text).toContain('Runtime PDP publishing: OK');
        expect(text).toContain('Shared PDP action: BROKEN');
        expect(text).toContain('ENCRYPTION_KEY');
        expect(text).toContain('Repair Site Configuration');
    });

    it('reports the action OK when it holds a readable key', () => {
        const report = makeReport({
            configService: {
                token: { present: true },
                configService: { httpStatus: 200 },
                pdpPublishing: { locked: true, keyCount: 1, actionKey: { registered: true } },
                verdict: 'ok',
            },
        } as Partial<DiagnosticsReport>);

        const text = buildSummaryLines(report).join('\n');
        expect(text).toContain('Shared PDP action: OK');
        expect(text).not.toContain('BROKEN');
    });

    it('does NOT call an unreachable action "no key"', () => {
        // Saying "not registered" would send someone to re-register a key that is
        // probably fine, and bury the fact that the service never answered.
        const report = makeReport({
            configService: {
                token: { present: true },
                configService: { httpStatus: 200 },
                pdpPublishing: {
                    locked: true,
                    keyCount: 1,
                    actionKey: { error: 'HTTP 503' },
                },
                verdict: 'ok',
            },
        } as Partial<DiagnosticsReport>);

        const text = buildSummaryLines(report).join('\n');
        expect(text).toContain('Shared PDP action: could not be reached (HTTP 503)');
        expect(text).not.toContain('Shared PDP action: BROKEN');
    });

    it('says nothing about the action when BYOM is off', () => {
        const report = makeReport({
            configService: {
                token: { present: true },
                configService: { httpStatus: 200 },
                pdpPublishing: { locked: true, keyCount: 1 },
                verdict: 'ok',
            },
        } as Partial<DiagnosticsReport>);

        const text = buildSummaryLines(report).join('\n');
        expect(text).not.toContain('Shared PDP action');
    });

    it('names the Config Service org admins when the roster is readable', () => {
        // "Ask an admin" is unactionable without a name. The roster read is the
        // only thing in the report that can supply one.
        const report = makeReport({
            configService: {
                token: { present: true },
                configService: { httpStatus: 403 },
                daLive: { httpStatus: 200 },
                orgAdmins: { status: 'ok', emails: ['owner@adobe.com'] },
                verdict: 'refused',
            },
        } as Partial<DiagnosticsReport>);

        // MASKED: this report is pasted into tickets, so it must not carry
        // colleague addresses. Recognisable, not publishable.
        const text = buildSummaryLines(report).join('\n');
        expect(text).toContain('Config admins: o****r@adobe.com');
        expect(text).not.toContain('owner@adobe.com');
    });

    it('says the roster is UNREADABLE rather than printing an empty admin list', () => {
        // Leah's shape. An empty list would read as "this org has no admins",
        // a different and much scarier claim than "you cannot see them".
        const report = makeReport({
            configService: {
                token: { present: true },
                configService: { httpStatus: 403 },
                daLive: { httpStatus: 200 },
                orgAdmins: { status: 'not_authorized' },
                verdict: 'refused',
            },
        } as Partial<DiagnosticsReport>);

        const text = buildSummaryLines(report).join('\n');
        expect(text).toContain('Config admins: not readable');
        expect(text).not.toContain('Config admins: \n');
    });

    it('prints the org COUNT beside "Can List Orgs" when known', () => {
        // "Can List Orgs: Yes" only means the command ran — `aio console org list`
        // returning [] still prints Yes. On 2026-08-13 that hid the actual finding
        // (a token reaching zero orgs) from the person reading the report.
        const report = makeReport({
            adobe: {
                installed: true,
                version: '11.0.1',
                authConfigured: true,
                tokenExpired: false,
                canListOrgs: true,
                organizationCount: 0,
            } as DiagnosticsReport['adobe'],
        });

        expect(buildSummaryLines(report).join('\n')).toContain('Can List Orgs: Yes (0 orgs)');
    });

    it('keeps the plain Yes/No line when the count is unknown', () => {
        const report = makeReport({
            adobe: {
                installed: true,
                version: '11.0.1',
                authConfigured: true,
                tokenExpired: false,
                canListOrgs: true,
            } as DiagnosticsReport['adobe'],
        });

        expect(buildSummaryLines(report).join('\n')).toContain('Can List Orgs: Yes\n');
    });
});

describe('runDiagnosticsAction', () => {
    const logger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        show: jest.fn(),
        exportDebugLog: jest.fn(),
    };
    const SUMMARY = '=== DIAGNOSTICS SUMMARY ===\nSystem: darwin';

    beforeEach(() => jest.clearAllMocks());

    it('copies the summary when Copy Report is chosen', async () => {
        await runDiagnosticsAction('Copy Report', SUMMARY, logger as never);

        expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith(SUMMARY);
    });

    it('confirms the copy so the user knows it worked', async () => {
        await runDiagnosticsAction('Copy Report', SUMMARY, logger as never);

        expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('still reveals the channel for Show Logs', async () => {
        await runDiagnosticsAction('Show Logs', SUMMARY, logger as never);

        expect(logger.show).toHaveBeenCalled();
        expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('still exports for Export Log', async () => {
        await runDiagnosticsAction('Export Log', SUMMARY, logger as never);

        expect(logger.exportDebugLog).toHaveBeenCalled();
        expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('does nothing when the notification is dismissed', async () => {
        await runDiagnosticsAction(undefined, SUMMARY, logger as never);

        expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled();
        expect(logger.show).not.toHaveBeenCalled();
        expect(logger.exportDebugLog).not.toHaveBeenCalled();
    });
});

/**
 * Both of these were found by running Diagnostics in a real Extension Host for
 * the first time — neither was visible from unit tests.
 */
describe('summary is fit to paste', () => {
    it('reports the MCP tool count, not the full roster', () => {
        // The roster is 682 characters on one line. Pasted into Slack or a
        // terminal it gets silently elided mid-string, which reads as a
        // corrupted tool name rather than as truncation. The count plus the
        // sign_in check is the actionable part; the roster stays in the debug
        // report dump for deep triage.
        const lines = buildSummaryLines(makeReport());

        expect(lines.some((l) => l.includes('Reachable: Yes'))).toBe(true);
        expect(lines.some((l) => l.startsWith('  Tools: '))).toBe(false);
    });

    it('keeps every line short enough to survive a paste', () => {
        const longest = Math.max(...buildSummaryLines(makeReport()).map((l) => l.length));
        expect(longest).toBeLessThan(200);
    });
});

describe('browserProbeCommand', () => {
    it('tests for the binary rather than running its help flag on macOS', () => {
        // `open --help` exits 1 on macOS by design — it prints usage to stderr.
        // checkCommand treats non-zero as "not installed", so every Mac has been
        // reporting "Browser Launch: Not available".
        const { binary, probe } = browserProbeCommand('darwin');

        expect(binary).toBe('open');
        expect(probe).not.toContain('--help');
        expect(probe).toContain('command -v open');
    });

    it('does the same on linux', () => {
        const { binary, probe } = browserProbeCommand('linux');

        expect(binary).toBe('xdg-open');
        expect(probe).toContain('command -v xdg-open');
    });

    it('leaves the windows probe alone', () => {
        // `start` is a cmd builtin, so an existence check does not apply. Left
        // as-is deliberately: unverified on Windows, and guessing would trade a
        // known-wrong answer on macOS for an unknown one there.
        expect(browserProbeCommand('win32').probe).toBe('start /?');
    });
});

/**
 * The storefront delivery section had NO render coverage at all — `makeReport`
 * never set `storefront`, so `storefrontLines` was unreachable from any test
 * while it printed "PDP /products/default: HTTP 200 (prerendered)" for
 * storefronts that could not serve a PDP.
 *
 * These pin the labels, because the label IS the bug: the request was always
 * fine, the word attached to it was not.
 */
describe('storefront delivery section', () => {
    const healthyProbe = {
        baseUrl: 'https://main--demo-builder-test--skukla.aem.live',
        site: { reachable: true, status: 200 },
        smart404Snippet: { installed: true, status: 200 },
        eagerRedirect: { installed: true, status: 200 },
        authoredTemplate: { path: '/products/default', status: 200, published: true },
        verdict:
            'Storefront delivery looks correct (fallback installed, template published). No SKU was checked.',
    };

    const linesFor = (storefront: unknown): string =>
        buildSummaryLines(makeReport({ storefront } as Partial<DiagnosticsReport>)).join('\n');

    it('labels the template as the overlay source, not as a PDP', () => {
        const out = linesFor(healthyProbe);

        expect(out).toContain('Overlay source template /products/default');
        expect(out).toContain('published');
    });

    it('never renders the word "prerendered"', () => {
        // The control. This section claimed a prerender had happened on the
        // strength of a request that cannot show one.
        expect(linesFor(healthyProbe)).not.toMatch(/prerender/i);
    });

    it('shouts when the source template is missing', () => {
        const out = linesFor({
            ...healthyProbe,
            authoredTemplate: { path: '/products/default', status: 404, published: false },
            verdict:
                "PDP fallback installed, but the overlay's source template /products/default returned 404. Publish it or reset the storefront — every PDP renders from this page.",
        });

        expect(out).toContain('NOT PUBLISHED');
        expect(out).toContain('every PDP renders from this page');
    });

    it('omits the section entirely when there is no storefront probe', () => {
        // Control for the three above: without this, a renderer that always
        // printed the section would pass them all.
        expect(buildSummaryLines(makeReport()).join('\n')).not.toContain('Storefront delivery');
    });
});
