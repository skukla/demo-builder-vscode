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

import type { DiagnosticsReport } from '@/commands/diagnosticsReport';
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
