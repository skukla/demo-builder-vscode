/**
 * Diagnostics report shape and rendering.
 *
 * Split from the command because these two change for different reasons: the
 * report's shape and how it reads are a contract with whoever pastes it into a
 * ticket, while collection is a contract with the tools and services being
 * probed. Keeping rendering free of `vscode` also lets it be tested directly,
 * which is what the leak guard in diagnostics-copyReport.test.ts relies on.
 *
 * @module commands/diagnosticsReport
 */

import type { ConfigServiceProbeResult } from '@/features/eds/services/configServiceProbe';
import type { CredentialProbeResult } from '@/features/eds/services/githubCredentialProbe';
import type { StorefrontProbeResult } from '@/features/eds/services/storefrontProbe';

// Diagnostic Type Definitions
export interface SystemInfo {
    platform: string;
    release: string;
    arch: string;
    cpus: number;
    memory: string;
    homedir: string;
    tmpdir: string;
    shell: string;
}

export interface VSCodeInfo {
    version: string;
    appName: string;
    language: string;
    machineId: string;
    sessionId: string;
}

export interface CommandCheckResult {
    installed: boolean;
    output?: string;
    error?: string;
    duration: number;
    code?: number;
    versions?: string[];
}

export interface ToolsInfo {
    node: CommandCheckResult;
    npm: CommandCheckResult;
    fnm: CommandCheckResult;
    git: CommandCheckResult;
    aio: CommandCheckResult;
}

export interface AdobeContextInfo {
    org: string;
    project: string;
    workspace: string;
}

export interface AdobeCLIInfo {
    installed: boolean;
    version?: string;
    authConfigured?: boolean;
    hasToken?: boolean;
    hasRefreshToken?: boolean;
    expiresIn?: string;
    tokenExpired?: boolean;
    expiryDate?: string;
    authParseError?: string;
    currentContext?: AdobeContextInfo | string;
    canListOrgs?: boolean;
    organizationCount?: number;
}

export interface EnvironmentInfo {
    PATH: string[];
    HOME: string | undefined;
    USER: string | undefined;
    SHELL: string | undefined;
    NODE_PATH: string | undefined;
    npm_config_prefix: string | undefined;
    FNM_DIR: string | undefined;
    FNM_MULTISHELL_PATH: string | undefined;
    FNM_NODE_DIST_MIRROR: string | undefined;
    FNM_LOGLEVEL: string | undefined;
}

export interface BrowserLaunchTest {
    platform: string;
    command: string;
    available: boolean;
}

export interface AdobeLoginTest {
    available: boolean;
    supportsForceFlag: boolean;
}

export interface FileSystemTest {
    canWrite: boolean;
    canRead: boolean;
    tempDir: string;
    error?: string;
}

export interface TestResults {
    browserLaunch: BrowserLaunchTest;
    adobeLoginCommand: AdobeLoginTest;
    fileSystem: FileSystemTest;
}

export interface McpInfo {
    /** True when a workspace is open and the in-extension server was reachable. */
    running: boolean;
    /** Absolute socket path probed (when a workspace is open). */
    socketPath?: string;
    /** Tool names the in-extension server exposed (sorted). */
    tools?: string[];
    /** Whether the auth `sign_in` tool is present (the common "is it there?" check). */
    hasSignIn?: boolean;
    /** Why the probe did not run / failed (no workspace, socket missing, timeout). */
    error?: string;
}

export interface DiagnosticsReport {
    timestamp: string;
    system: SystemInfo;
    vscode: VSCodeInfo;
    tools: ToolsInfo;
    adobe: AdobeCLIInfo;
    environment: EnvironmentInfo;
    tests: TestResults;
    mcp: McpInfo;
    githubCredential: CredentialProbeResult;
    /** Absent when no EDS project is open — there is no site config to probe. */
    configService?: ConfigServiceProbeResult;
    /**
     * What the storefront is actually SERVING, as opposed to what the creating run
     * attempted. Absent when no EDS project is open.
     */
    storefront?: StorefrontProbeResult;
}

/** Describe GitHub's write-access answer, or why we don't have one. */
function describeWriteAccess(repo: NonNullable<CredentialProbeResult['repo']>): string {
    if (repo.canPush === true) return 'Yes';
    if (repo.canPush === false) return 'No';
    return repo.error ?? 'unknown';
}

/** Summarize the AEM admin response, omitting anything it did not return. */
function describeAdminApi(admin: NonNullable<CredentialProbeResult['adminApi']>): string {
    if (admin.error) return admin.error;

    const parts: string[] = [];
    if (admin.httpStatus !== undefined) parts.push(`HTTP ${admin.httpStatus}`);
    if (admin.codeStatus !== undefined) parts.push(`code.status ${admin.codeStatus}`);
    if (admin.xError) parts.push(`x-error: ${admin.xError}`);
    return parts.length > 0 ? parts.join(', ') : 'no response';
}

/** Render the GitHub/AEM credential section.
 *
 * Verdict last: it is the conclusion the findings above add up to. The
 * credential itself is never included — only its TYPE prefix — which is what
 * makes the summary safe to paste into a ticket.
 */
function credentialLines(cred: CredentialProbeResult): string[] {
    const lines = ['', 'GitHub / AEM credential:', `  Signed in as: ${cred.github?.login ?? 'not signed in'}`];

    if (cred.github?.tokenType) lines.push(`  Credential type: ${cred.github.tokenType}`);
    if (cred.github?.grantedScopes) lines.push(`  Granted scopes: ${cred.github.grantedScopes.join(', ')}`);
    if (cred.repo) lines.push(`  Write access to ${cred.repo.fullName}: ${describeWriteAccess(cred.repo)}`);
    if (cred.adminApi) lines.push(`  AEM admin API: ${describeAdminApi(cred.adminApi)}`);

    lines.push(`  → ${cred.verdict}`);
    return lines;
}


/**
 * Render the Configuration Service probe.
 *
 * Prints the invocation ID whenever Adobe returned one — it is the only handle
 * Adobe support can trace a specific refusal by, and it was being discarded.
 */
/**
 * Render the storefront delivery legs.
 *
 * Says what is SERVING, which the rest of the report cannot: every other EDS
 * signal here describes the extension's own last run.
 */
function storefrontLines(probe: StorefrontProbeResult): string[] {
    const lines = ['', 'Storefront delivery (what is serving now):', `  URL: ${probe.baseUrl}`];
    const mark = (leg?: { installed: boolean; status?: number; error?: string }): string => {
        if (!leg) return 'not checked';
        if (leg.error) return `unreachable (${leg.error})`;
        return `${leg.installed ? 'installed' : 'MISSING'} (HTTP ${leg.status})`;
    };

    if (!probe.site.reachable) {
        lines.push(`  Site: unreachable${probe.site.status ? ` (HTTP ${probe.site.status})` : ''}`);
    } else {
        lines.push('  Site: reachable');
        lines.push(`  Smart 404 handler (delayed.js): ${mark(probe.smart404Snippet)}`);
        lines.push(`  Eager redirect (404.html): ${mark(probe.eagerRedirect)}`);
        if (probe.pdp) {
            lines.push(
                `  PDP ${probe.pdp.path}: HTTP ${probe.pdp.status}`
                    + ` (${probe.pdp.prerendered ? 'prerendered' : 'not prerendered'})`,
            );
        }
    }
    lines.push(`  \u2192 ${probe.verdict}`);
    return lines;
}

function configServiceLines(probe: ConfigServiceProbeResult): string[] {
    const lines = ['', 'Configuration Service (site config):'];

    if (!probe.token.present) {
        lines.push('  DA.live credential: none stored');
        lines.push(`  \u2192 ${probe.verdict}`);
        return lines;
    }

    const cfg = probe.configService;
    if (cfg?.error) {
        lines.push(`  Site config read: unreachable (${cfg.error})`);
    } else if (cfg) {
        lines.push(`  Site config read: HTTP ${cfg.httpStatus}`);
        if (cfg.xError) lines.push(`  x-error: ${cfg.xError}`);
        if (cfg.invocationId) lines.push(`  x-invocation-id: ${cfg.invocationId}`);
    }

    const da = probe.daLive;
    if (da?.error) lines.push(`  Same credential vs DA.live: unreachable (${da.error})`);
    else if (da) lines.push(`  Same credential vs DA.live: HTTP ${da.httpStatus}`);

    lines.push(`  \u2192 ${probe.verdict}`);
    return lines;
}

/**
 * Build the diagnostics summary as lines.
 *
 * Separated from logging so the same text can be both written to the channel
 * and copied to the clipboard — one source, so the copy can never drift from
 * what the user was shown.
 */
/**
 * Choose how to probe browser-launch capability for a platform.
 *
 * `open --help` exits 1 on macOS by design — it prints usage to stderr — and
 * checkCommand treats a non-zero exit as "not installed". Every Mac therefore
 * reported "Browser Launch: Not available". Test that the binary EXISTS instead
 * of running a help flag whose exit code we assumed.
 *
 * Windows is left on its original probe: `start` is a cmd builtin, so an
 * existence check does not apply, and this is unverified there — swapping a
 * known-wrong macOS answer for an unknown Windows one is a bad trade.
 */
export function browserProbeCommand(platform: string): { binary: string; probe: string } {
    if (platform === 'win32') return { binary: 'start', probe: 'start /?' };
    const binary = platform === 'darwin' ? 'open' : 'xdg-open';
    return { binary, probe: `command -v ${binary}` };
}

export function buildSummaryLines(report: DiagnosticsReport): string[] {
    const lines: string[] = [
        '=== DIAGNOSTICS SUMMARY ===',
        `System: ${report.system.platform} ${report.system.release}`,
        `VS Code: ${report.vscode.version}`,
        '',
        'Tools Status:',
    ];

    // SOP §4: for...of instead of Object.entries().forEach()
    for (const [tool, info] of Object.entries(report.tools)) {
        const status = info.installed ? '✅' : '❌';
        lines.push(`  ${status} ${tool}: ${info.installed ? info.output : 'Not installed'}`);
    }

    if (report.adobe.installed) {
        lines.push('', 'Adobe CLI Status:', `  Version: ${report.adobe.version}`);
        lines.push(`  Authenticated: ${report.adobe.authConfigured ? 'Yes' : 'No'}`);
        if (report.adobe.authConfigured) {
            lines.push(`  Token Valid: ${!report.adobe.tokenExpired ? 'Yes' : 'No'}`);
            lines.push(`  Can List Orgs: ${report.adobe.canListOrgs ? 'Yes' : 'No'}`);
        }
    }

    lines.push(
        '',
        'Diagnostic Tests:',
        `  Browser Launch: ${report.tests.browserLaunch.available ? 'Available' : 'Not available'}`,
        `  Adobe Login Command: ${report.tests.adobeLoginCommand.available ? 'Available' : 'Not available'}`,
        `  File System Access: ${report.tests.fileSystem.canWrite ? 'OK' : 'Failed'}`,
        '',
        'MCP Server (in-extension):',
    );

    if (report.mcp.running) {
        const tools = report.mcp.tools ?? [];
        lines.push(`  Reachable: Yes (${tools.length} tool${tools.length === 1 ? '' : 's'})`);
        lines.push(`  sign_in tool: ${report.mcp.hasSignIn ? '✅ present' : '❌ missing'}`);
        // The full roster is ~680 characters on one line. Pasted into Slack or a
        // terminal it is silently elided mid-string, which reads as a corrupted
        // tool name rather than as truncation. The count above is the actionable
        // part; the roster stays in the debug report dump.
    } else {
        lines.push('  Reachable: No', `  Reason: ${report.mcp.error ?? 'unknown'}`);
    }

    lines.push(...credentialLines(report.githubCredential));
    if (report.configService) lines.push(...configServiceLines(report.configService));
    if (report.storefront) lines.push(...storefrontLines(report.storefront));
    lines.push('', 'Use VS Code\'s "Set Log Level..." command to see debug/trace details');
    return lines;
}
