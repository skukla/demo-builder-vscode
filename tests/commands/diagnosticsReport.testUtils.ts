/**
 * Shared setup for the `diagnosticsReport` suites.
 *
 * The family formed on 2026-09-07 when the copy-report tests were split out of
 * `diagnostics-copyReport.test.ts`: their subjects (`buildSummaryLines`,
 * `browserProbeCommand`) are declared HERE in `diagnosticsReport.ts` and merely
 * re-exported by `diagnostics.ts`, so every kill was being credited to a module
 * they never constrain.
 *
 * `makeReport` was duplicated in both suites before this file existed.
 *
 * The token is ASSEMBLED rather than written. A `gho_`-prefixed literal beside a
 * leak-guard test is the shape a secret scanner matches whatever it spells, and
 * this repository is public — see tests/helpers/credentialShapes.ts.
 */

export { buildSummaryLines, browserProbeCommand } from '@/commands/diagnosticsReport';
export type { DiagnosticsReport } from '@/commands/diagnosticsReport';

import type { CommandCheckResult, DiagnosticsReport } from '@/commands/diagnosticsReport';
import { githubTokenShape } from '../helpers/credentialShapes';

/** A token-shaped value the summary must never echo. */
export const TOKEN = githubTokenShape('0123456789abcdef0123456789abcdef');

export function makeReport(overrides: Partial<DiagnosticsReport> = {}): DiagnosticsReport {
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

/**
 * A report with every REQUIRED field, built against the real interfaces.
 *
 * `makeReport` above is cast through `as unknown as` and fills in only what the
 * copy-report tests read, which means tsc checks nothing about its shape. This
 * one takes no cast: a field that stops existing, or changes type, fails
 * `npm run typecheck:tests` instead of surfacing as a mystery line in a report.
 *
 * Everything OPTIONAL is left absent on purpose, so a suite that renders a
 * section is the suite that supplies it.
 */
export function makeTypedReport(overrides: Partial<DiagnosticsReport> = {}): DiagnosticsReport {
    const tool: CommandCheckResult = { installed: true, output: 'v22.0.0', duration: 1 };
    return {
        timestamp: '2026-09-07T00:00:00Z',
        system: {
            platform: 'darwin',
            release: '25.6.0',
            arch: 'arm64',
            cpus: 10,
            memory: '32 GB',
            homedir: '/Users/sc',
            tmpdir: '/tmp',
            shell: '/bin/zsh',
        },
        vscode: {
            version: '1.99.0',
            appName: 'Visual Studio Code',
            language: 'en',
            machineId: 'machine-1',
            sessionId: 'session-1',
        },
        tools: { node: tool, npm: tool, fnm: tool, git: tool, aio: tool },
        adobe: { installed: true, version: '11.0.1', authConfigured: true, tokenExpired: false },
        environment: {
            PATH: ['/usr/local/bin'],
            HOME: '/Users/sc',
            USER: 'sc',
            SHELL: '/bin/zsh',
            NODE_PATH: undefined,
            npm_config_prefix: undefined,
            FNM_DIR: undefined,
            FNM_MULTISHELL_PATH: undefined,
            FNM_NODE_DIST_MIRROR: undefined,
            FNM_LOGLEVEL: undefined,
        },
        tests: {
            browserLaunch: { platform: 'darwin', command: 'command -v open', available: true },
            adobeLoginCommand: { available: true, supportsForceFlag: true },
            fileSystem: { canWrite: true, canRead: true, tempDir: '/tmp' },
        },
        mcp: { running: true, socketPath: '/projects/.mcp.sock', tools: ['sign_in'], hasSignIn: true },
        githubCredential: { github: { reachable: true, login: 'sc' }, verdict: 'Credential is fine.' },
        ...overrides,
    };
}

/**
 * One section of the summary, title line through to the blank line before the next.
 *
 * Every section is rendered as `''` then its title, so the blank line is the
 * terminator. Slicing lets a test assert a section EXACTLY — `toStrictEqual` on
 * the lines — without restating the whole report each time, which is what makes
 * a changed word in one line a failure rather than a still-passing `toContain`.
 */
export function section(lines: string[], title: string): string[] {
    const start = lines.indexOf(title);
    if (start < 0) return [];
    const rest = lines.slice(start + 1);
    const end = rest.indexOf('');
    return [title, ...(end < 0 ? rest : rest.slice(0, end))];
}
