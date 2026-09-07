/**
 * The summary's own sections — header, tools, Adobe CLI, the local tests, the
 * MCP server, orphaned settings and the Claude Code footprint.
 *
 * The EDS sections have suites of their own; this one covers what every report
 * carries regardless of what is installed. The golden below asserts the whole
 * array, because the thing that breaks here is a line quietly changing shape or
 * disappearing, and both survive a substring check.
 */

import {
    browserProbeCommand,
    buildSummaryLines,
    makeTypedReport,
    section,
    type DiagnosticsReport,
} from './diagnosticsReport.testUtils';
import type { AdobeCLIInfo, McpInfo, ToolsInfo } from '@/commands/diagnosticsReport';

const TOOLS: ToolsInfo = {
    node: { installed: true, output: 'v22.0.0', duration: 1 },
    npm: { installed: true, output: '10.5.0', duration: 1 },
    fnm: { installed: false, duration: 1 },
    git: { installed: true, output: 'git 2.44.0', duration: 1 },
    aio: { installed: false, duration: 1 },
};

describe('the whole summary', () => {
    it('reads exactly like this', () => {
        const report = makeTypedReport({
            tools: TOOLS,
            adobe: {
                installed: true,
                version: '11.0.1',
                authConfigured: true,
                tokenExpired: false,
                canListOrgs: true,
                organizationCount: 1,
            },
            orphanedSettings: ['demoBuilder.eds.defaultOrg'],
        });

        expect(buildSummaryLines(report)).toStrictEqual([
            '=== DIAGNOSTICS SUMMARY ===',
            'System: darwin 25.6.0',
            'VS Code: 1.99.0',
            '',
            'Tools Status:',
            '  ✅ node: v22.0.0',
            '  ✅ npm: 10.5.0',
            '  ❌ fnm: Not installed',
            '  ✅ git: git 2.44.0',
            '  ❌ aio: Not installed',
            '',
            'Adobe CLI Status:',
            '  Version: 11.0.1',
            '  Authenticated: Yes',
            '  Token Valid: Yes',
            '  Can List Orgs: Yes (1 org)',
            '',
            'Diagnostic Tests:',
            '  Browser Launch: Available',
            '  Adobe Login Command: Available',
            '  File System Access: OK',
            '',
            'MCP Server (in-extension):',
            '  Reachable: Yes (1 tool)',
            '  sign_in tool: ✅ present',
            '',
            'Settings you have set that this extension NO LONGER READS:',
            '  ⚠️  demoBuilder.eds.defaultOrg',
            '  These were renamed or removed. Their values are being ignored, and any',
            '  replacement setting is falling back to its default — silently.',
            '',
            'GitHub / AEM credential:',
            '  Signed in as: sc',
            '  → Credential is fine.',
            '',
            'Use VS Code\'s "Set Log Level..." command to see debug/trace details',
        ]);
    });
    /**
     * The same report with every optional section switched on.
     *
     * The EDS sections have their own suites for their variants; what this pins
     * is the ASSEMBLY — that each one appears once, in this order, separated by
     * the blank line that makes the whole thing readable when pasted.
     */
    it('assembles every optional section in this order', () => {
        const report = makeTypedReport({
            tools: { ...TOOLS, fnm: { installed: true, output: '1.35.1', duration: 1 } },
            adobe: { installed: false },
            credentialService: {
                configured: true,
                orgId: '285361',
                endpoint: { httpStatus: 200 },
                verdict: 'Shared credential available.',
            },
            configService: {
                token: { present: true },
                configService: { httpStatus: 200 },
                verdict: 'The site config is readable.',
            },
            storefront: {
                baseUrl: 'https://main--demo--skukla.aem.live',
                site: { reachable: false },
                verdict: 'The site is not answering.',
            },
            claudeCode: { root: '/Users/sc/.claude', exists: false },
        });

        expect(buildSummaryLines(report)).toStrictEqual([
            '=== DIAGNOSTICS SUMMARY ===',
            'System: darwin 25.6.0',
            'VS Code: 1.99.0',
            '',
            'Tools Status:',
            '  \u2705 node: v22.0.0',
            '  \u2705 npm: 10.5.0',
            '  \u2705 fnm: 1.35.1',
            '  \u2705 git: git 2.44.0',
            '  \u274c aio: Not installed',
            '',
            'Diagnostic Tests:',
            '  Browser Launch: Available',
            '  Adobe Login Command: Available',
            '  File System Access: OK',
            '',
            'MCP Server (in-extension):',
            '  Reachable: Yes (1 tool)',
            '  sign_in tool: \u2705 present',
            '',
            'GitHub / AEM credential:',
            '  Signed in as: sc',
            '  \u2192 Credential is fine.',
            '',
            'Commerce credential service (shared):',
            '  Configured: yes (org 285361)',
            '  Endpoint: HTTP 200',
            '  \u2192 Shared credential available.',
            '',
            'Configuration Service (site config):',
            '  Site config read: HTTP 200',
            '  \u2192 The site config is readable.',
            '',
            'Storefront delivery (what is serving now):',
            '  URL: https://main--demo--skukla.aem.live',
            '  Site: unreachable',
            '  \u2192 The site is not answering.',
            '',
            'Claude Code storage (/Users/sc/.claude):',
            '  Not present (Claude Code has not run on this machine)',
            '',
            'Use VS Code\'s "Set Log Level..." command to see debug/trace details',
        ]);
    });
});

describe('the Adobe CLI section', () => {
    const adobeSection = (adobe: AdobeCLIInfo): string[] =>
        section(buildSummaryLines(makeTypedReport({ adobe })), 'Adobe CLI Status:');

    // Nothing to say about a CLI that is not there, and an empty section would
    // read as "installed, and every check came back blank".
    it('is absent entirely when the CLI is not installed', () => {
        expect(adobeSection({ installed: false })).toStrictEqual([]);
    });

    it('stops after Authenticated when there is no auth to inspect', () => {
        expect(adobeSection({ installed: true, version: '11.0.1', authConfigured: false })).toStrictEqual([
            'Adobe CLI Status:',
            '  Version: 11.0.1',
            '  Authenticated: No',
        ]);
    });

    it('says the token is not valid once it has expired', () => {
        expect(
            adobeSection({
                installed: true,
                version: '11.0.1',
                authConfigured: true,
                tokenExpired: true,
            }),
        ).toStrictEqual([
            'Adobe CLI Status:',
            '  Version: 11.0.1',
            '  Authenticated: Yes',
            '  Token Valid: No',
            '  Can List Orgs: No',
        ]);
    });

    /**
     * "Can List Orgs: Yes" only proves the command RAN — a token reaching zero
     * orgs still prints Yes, which is exactly what the org badge greys out on.
     * The count is the finding, so it is printed whenever it is known.
     */
    it('prints the org count, singular or plural, whenever it knows it', () => {
        const canList = (organizationCount?: number): string =>
            adobeSection({
                installed: true,
                version: '11.0.1',
                authConfigured: true,
                tokenExpired: false,
                canListOrgs: true,
                organizationCount,
            })[4];

        expect(canList(0)).toBe('  Can List Orgs: Yes (0 orgs)');
        expect(canList(1)).toBe('  Can List Orgs: Yes (1 org)');
        expect(canList(2)).toBe('  Can List Orgs: Yes (2 orgs)');
        expect(canList(undefined)).toBe('  Can List Orgs: Yes');
    });
});

describe('the local test section', () => {
    it('names each failed capability rather than reporting one flat failure', () => {
        const tests: DiagnosticsReport['tests'] = {
            browserLaunch: { platform: 'linux', command: 'command -v xdg-open', available: false },
            adobeLoginCommand: { available: false, supportsForceFlag: false },
            fileSystem: { canWrite: false, canRead: false, tempDir: '/tmp', error: 'EACCES' },
        };

        expect(section(buildSummaryLines(makeTypedReport({ tests })), 'Diagnostic Tests:')).toStrictEqual([
            'Diagnostic Tests:',
            '  Browser Launch: Not available',
            '  Adobe Login Command: Not available',
            '  File System Access: Failed',
        ]);
    });
});

describe('the MCP section', () => {
    const mcpSection = (mcp: McpInfo): string[] =>
        section(buildSummaryLines(makeTypedReport({ mcp })), 'MCP Server (in-extension):');

    // The full roster is ~680 characters on one line: pasted into Slack it is
    // silently elided mid-string, which reads as a corrupted tool name. The
    // count plus the sign_in check is the actionable part.
    it('counts the tools instead of listing them', () => {
        expect(mcpSection({ running: true, tools: ['sign_in', 'get_current_project'], hasSignIn: true })).toStrictEqual([
            'MCP Server (in-extension):',
            '  Reachable: Yes (2 tools)',
            '  sign_in tool: ✅ present',
        ]);
    });

    // A server that answered with no tools is a real and different state from
    // a server that did not answer, and it must not be inflated into one.
    it('reports zero tools when the server listed none', () => {
        expect(mcpSection({ running: true, hasSignIn: false })).toStrictEqual([
            'MCP Server (in-extension):',
            '  Reachable: Yes (0 tools)',
            '  sign_in tool: ❌ missing',
        ]);
    });

    it('carries the probe’s reason when the server is not running', () => {
        expect(mcpSection({ running: false, error: 'socket not found' })).toStrictEqual([
            'MCP Server (in-extension):',
            '  Reachable: No',
            '  Reason: socket not found',
        ]);
    });

    it('says "unknown" rather than nothing when the probe gave no reason', () => {
        expect(mcpSection({ running: false })[2]).toBe('  Reason: unknown');
    });
});

describe('orphaned settings', () => {
    // CONTROL for the golden above: the section is a finding, not a fixture, so
    // it must be absent when the check found nothing and when it could not run.
    it('is absent when there are none and when the check did not run', () => {
        const title = 'Settings you have set that this extension NO LONGER READS:';

        expect(section(buildSummaryLines(makeTypedReport({ orphanedSettings: [] })), title)).toStrictEqual([]);
        expect(section(buildSummaryLines(makeTypedReport()), title)).toStrictEqual([]);
    });
});

/**
 * Claude Code's own `~/.claude` footprint — report-only, and rendered by
 * `claudeCodeFootprint`'s real function rather than a stub, so a change to
 * either side shows up here.
 */
describe('the Claude Code footprint', () => {
    it('appears when the walk ran, and is absent when it was skipped', () => {
        const withWalk = buildSummaryLines(
            makeTypedReport({ claudeCode: { root: '/Users/sc/.claude', exists: false } }),
        );

        expect(withWalk).toContain('Claude Code storage (/Users/sc/.claude):');
        expect(buildSummaryLines(makeTypedReport()).join('\n')).not.toContain('Claude Code storage');
    });
});

describe('browserProbeCommand', () => {
    // `open --help` exits 1 on macOS by design, and checkCommand reads a
    // non-zero exit as "not installed" — so every Mac reported the browser
    // launch unavailable. Test that the binary EXISTS instead.
    it('probes for the binary on macOS and linux', () => {
        expect(browserProbeCommand('darwin')).toStrictEqual({
            binary: 'open',
            probe: 'command -v open',
        });
        expect(browserProbeCommand('linux')).toStrictEqual({
            binary: 'xdg-open',
            probe: 'command -v xdg-open',
        });
    });

    // `start` is a cmd builtin, so an existence check does not apply. Left on
    // its original probe deliberately: unverified on Windows, and guessing
    // would trade a known-wrong macOS answer for an unknown one there.
    it('leaves the windows probe — and its binary — alone', () => {
        expect(browserProbeCommand('win32')).toStrictEqual({ binary: 'start', probe: 'start /?' });
    });
});
