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

import { maskEmail } from '@/core/utils/maskEmail';
import { type CredentialServiceProbeResult } from '@/features/data-installer/services/credentialServiceProbe';
import type { SamplePdp } from '@/features/eds/services/catalogPrewarmService';
import { type ConfigServiceProbeResult } from '@/features/eds/services/configServiceProbe';
import type { CredentialProbeResult } from '@/features/eds/services/githubCredentialProbe';
import { describeScope } from '@/features/eds/services/servedStorefrontConfig';
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
     * Whether the shared Commerce credential service is configured and serving.
     * Always present: it is a global capability, not a per-project one, so a user
     * with no project open can still find out why sample-data import is missing.
     */
    credentialService?: CredentialServiceProbeResult;
    /**
     * What the storefront is actually SERVING, as opposed to what the creating run
     * attempted. Absent when no EDS project is open.
     */
    storefront?: StorefrontProbeResult;
    /**
     * Which store scope the PDP sample came from, and any disagreement with the
     * project's own config. Absent when no EDS project is open or no SKU was
     * sampled.
     */
    storefrontScope?: StorefrontScopeReport;
}

/** The scope the probe sampled from, plus a disagreement when there is one. */
export interface StorefrontScopeReport {
    source: 'served' | 'manifest';
    divergence?: SamplePdp['scopeDivergence'];
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
    const lines = [
        '',
        'GitHub / AEM credential:',
        `  Signed in as: ${cred.github?.login ?? 'not signed in'}`,
    ];

    if (cred.github?.tokenType) lines.push(`  Credential type: ${cred.github.tokenType}`);
    if (cred.github?.grantedScopes)
        lines.push(`  Granted scopes: ${cred.github.grantedScopes.join(', ')}`);
    if (cred.repo)
        lines.push(`  Write access to ${cred.repo.fullName}: ${describeWriteAccess(cred.repo)}`);
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
/**
 * Describe the scope the PDP sample came from.
 *
 * Silent when the served and project scopes agree — that is the normal case and
 * needs no line. A disagreement between a Configure save and a Republish is
 * expected too, so it reads as context; only `unexpected` (the project claims
 * published yet the CDN serves something else) is called out as wrong.
 */
function scopeLines(scope: StorefrontScopeReport): string[] {
    if (scope.source === 'manifest') {
        return ['  Scope: sampled from the project (served config.json unreadable)'];
    }
    if (!scope.divergence) return [];

    const { served, manifest, unexpected } = scope.divergence;
    const lines = [
        `  Scope: serving ${describeScope(served)}, project configured for ${describeScope(manifest)}`,
    ];
    lines.push(
        unexpected
            ? '    ⚠ Project reads "published" — a republish did not take'
            : '    (expected: republish pending)',
    );
    return lines;
}

function storefrontLines(probe: StorefrontProbeResult, scope?: StorefrontScopeReport): string[] {
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
            // The SKU is printed so the reader can repeat the request by hand —
            // the first thing anyone wants after seeing this line go red.
            lines.push(
                `  PDP ${probe.pdp.path} (SKU ${probe.pdp.sku}): ` +
                    `HTTP ${probe.pdp.status} (${probe.pdp.served ? 'served' : 'NOT SERVED'})`,
            );
            if (scope) lines.push(...scopeLines(scope));
        } else {
            lines.push('  PDP: not checked (no catalog SKU available)');
        }
        if (probe.authoredTemplate) {
            // Labelled as the overlay's source, not as a PDP. Calling this line
            // "PDP … (prerendered)" is what let a broken storefront read clean.
            lines.push(
                `  Overlay source template ${probe.authoredTemplate.path}: ` +
                    `HTTP ${probe.authoredTemplate.status}` +
                    ` (${probe.authoredTemplate.published ? 'published' : 'NOT PUBLISHED'})`,
            );
        }
    }
    if (probe.overlay) {
        // Reported, not judged. The reader compares this sha to
        // accs-discovery-service's git log; the extension has no expectation to
        // assert against, and inventing one would go red on every legitimate
        // deploy of that action.
        lines.push(
            probe.overlay.unknown
                ? '  Overlay action build: unknown (deployed action predates /__version)'
                : `  Overlay action build: ${probe.overlay.sha ?? '?'} (v${probe.overlay.version ?? '?'})`,
        );
    }
    lines.push(`  \u2192 ${probe.verdict}`);
    return lines;
}

/**
 * Report whether the shared PDP action can read this site's key.
 *
 * Silent when BYOM is off — there is no action to ask, and a line about a
 * feature the user has not enabled is noise in a report meant for tickets.
 */
function describeActionKey(
    actionKey: NonNullable<ConfigServiceProbeResult['pdpPublishing']>['actionKey'],
): string[] {
    if (!actionKey) return [];

    if (actionKey.error !== undefined) {
        // NOT "no key" — the action never answered, so its key is unknown.
        // Saying "not registered" here would send someone to re-register a key
        // that is probably fine and hide that the service is unreachable.
        return [`  Shared PDP action: could not be reached (${actionKey.error})`];
    }

    if (actionKey.registered) {
        return ['  Shared PDP action: OK (holds a readable key for this site)'];
    }

    return [
        '  Shared PDP action: BROKEN — it holds no readable key for this site.',
        '    Either the registration never landed, or the action was redeployed with a ' +
            'different ENCRYPTION_KEY, which makes every previously stored key unreadable.',
        '    Fix: run "Demo Builder: Repair Site Configuration". If that does not help, ' +
            'the deployed ENCRYPTION_KEY no longer matches the one the keys were written with.',
    ];
}

/**
 * The shared Commerce credential service.
 *
 * Reports whether one is configured and whether it will serve THIS user — four
 * states that are otherwise indistinguishable from the import screen, where all
 * of them end at "add a client id and secret".
 *
 * The endpoint URL is never printed: it is an internal Runtime address, and this
 * report gets pasted into tickets.
 */
function credentialServiceLines(probe: CredentialServiceProbeResult): string[] {
    const lines = ['', 'Commerce credential service (shared):'];

    if (!probe.configured) {
        lines.push('  Configured: no');
        lines.push(`  \u2192 ${probe.verdict}`);
        return lines;
    }

    lines.push(`  Configured: yes${probe.orgId ? ` (org ${probe.orgId})` : ''}`);
    if (probe.endpoint?.error) {
        lines.push(`  Endpoint: unreachable (${probe.endpoint.error})`);
    } else if (probe.endpoint?.httpStatus !== undefined) {
        lines.push(`  Endpoint: HTTP ${probe.endpoint.httpStatus}`);
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

    // Runtime PDP self-heal. Stated as a plain verdict, not two raw numbers: the
    // broken combination (locked, no key) is silent in every other surface and
    // shows up days later as "some product pages don't work".
    //
    // The site half and the ACTION half are reported separately on purpose. They
    // can disagree, and the disagreement is the diagnosis: a key on the site that
    // the action cannot read means the registration never landed, or the action
    // was redeployed with a different ENCRYPTION_KEY. Collapsing them into one
    // "OK" would hide the only case nothing else in this report can see.
    const pdp = probe.pdpPublishing;
    if (pdp?.error) {
        lines.push(`  Runtime PDP publishing: could not determine (${pdp.error})`);
    } else if (pdp) {
        const keys = pdp.keyCount;
        if (!pdp.locked) {
            lines.push('  Runtime PDP publishing: OK (site admin API is open)');
        } else if (keys === undefined) {
            lines.push('  Runtime PDP publishing: site is admin-locked; key count unreadable');
        } else if (keys > 0) {
            lines.push(
                `  Runtime PDP publishing: OK (admin-locked, ${keys} publish key(s) registered)`,
            );
        } else {
            lines.push(
                '  Runtime PDP publishing: BROKEN — site is admin-locked with no publish key.',
            );
            lines.push(
                '    Products added after setup will 404 on first visit. Fix: run ' +
                    '"Demo Builder: Repair Site Configuration" to re-register a key.',
            );
        }
        lines.push(...describeActionKey(pdp.actionKey));
    }

    // Who can grant. "Ask an admin" is unactionable without a name, and the
    // roster's own refusal is the more useful answer when it comes: it means
    // nobody is visible to ask, so the Code Sync setup flow is the only path.
    // Never print an empty list \u2014 that reads as "this org has no admins", a
    // different and much scarier claim than "you cannot see them".
    // MASKED — this report is written to be pasted into tickets. Full addresses
    // stay in the interactive surfaces (Manage Site Access, the wizard message),
    // which are transient and never exported.
    const admins = probe.orgAdmins;
    if (admins?.status === 'ok') {
        lines.push(
            admins.emails && admins.emails.length > 0
                ? `  Config admins: ${admins.emails.map(maskEmail).join(', ')}`
                : '  Config admins: none listed on this org',
        );
    } else if (admins?.status === 'not_authorized') {
        lines.push('  Config admins: not readable (403) \u2014 no admin is visible to ask');
    } else if (admins?.status === 'failed') {
        lines.push('  Config admins: roster read failed');
    }

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
            // "Yes" only proves the command ran — an empty org list still prints
            // Yes. The count is the finding (a token reaching 0 orgs is exactly
            // what the org badge greys out on), so print it whenever it's known.
            const orgCount =
                report.adobe.canListOrgs && report.adobe.organizationCount !== undefined
                    ? ` (${report.adobe.organizationCount} org${report.adobe.organizationCount === 1 ? '' : 's'})`
                    : '';
            lines.push(`  Can List Orgs: ${report.adobe.canListOrgs ? 'Yes' : 'No'}${orgCount}`);
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
    if (report.credentialService)
        lines.push(...credentialServiceLines(report.credentialService));
    if (report.configService) lines.push(...configServiceLines(report.configService));
    if (report.storefront)
        lines.push(...storefrontLines(report.storefront, report.storefrontScope));
    lines.push('', 'Use VS Code\'s "Set Log Level..." command to see debug/trace details');
    return lines;
}
