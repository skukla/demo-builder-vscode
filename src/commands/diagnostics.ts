/**
 * Demo Builder diagnostics command.
 *
 * Collects the report — system, tools, Adobe CLI, environment, capability
 * tests, MCP, and the two credential probes — then hands it to
 * `./diagnosticsReport` to render. Collection lives here because it needs
 * `vscode` and the service locator; rendering deliberately does not.
 *
 * Re-exports the rendering entry points so existing consumers and tests keep
 * their import path.
 */

import * as vscode from 'vscode';
import {
    checkAdobeCLI,
    checkTools,
    getEnvironment,
    getSystemInfo,
    getVSCodeInfo,
    runTests,
} from './diagnosticsChecks';
import {
    buildSummaryLines,
    type AdobeCLIInfo,
    type DiagnosticsReport,
    type EnvironmentInfo,
    type McpInfo,
    type StorefrontScopeReport,
    type SystemInfo,
    type TestResults,
    type ToolsInfo,
    type VSCodeInfo,
} from './diagnosticsReport';
import { ServiceLocator } from '@/core/di';
import { getLogger, type DebugLogger } from '@/core/logging';
import { resolveProjectsRoot } from '@/core/utils/projectsRoot';
import { mcpSocketBindings } from '@/features/ai/server/mcpSocketPath';
import { probeInExtensionMcpTools } from '@/features/ai/server/mcpToolProbe';
import { getDaLiveAuthService, resolveByomOverlayUrl } from '@/features/eds/handlers/edsHelpers';
import { pickSampleSku } from '@/features/eds/services/catalogPrewarmService';
import {
    probeConfigService,
    type ConfigServiceProbeResult,
} from '@/features/eds/services/configServiceProbe';
import { createDaLiveServiceTokenProvider } from '@/features/eds/services/daLiveContentOperations';
import {
    probeGitHubCredential,
    type CredentialProbeResult,
} from '@/features/eds/services/githubCredentialProbe';
import { GitHubTokenService } from '@/features/eds/services/githubTokenService';
import {
    probeStorefrontDelivery,
    type StorefrontProbeResult,
} from '@/features/eds/services/storefrontProbe';
import { getEdsDaLiveTarget, getEdsGithubRepo } from '@/types/typeGuards';

export { browserProbeCommand, buildSummaryLines } from './diagnosticsReport';
export type { DiagnosticsReport } from './diagnosticsReport';

/** Actions offered on the completion notification. Copy is first: for a
 *  colleague reporting a problem it is the primary one. */
export const DIAGNOSTICS_ACTIONS = ['Copy Report', 'Show Logs', 'Export Log'] as const;

/**
 * The overlay's SOURCE template path — NOT a PDP.
 *
 * `render-pdp` fetches `/products/default` from the live tier and returns it as
 * the body for real PDP paths, so every storefront with the overlay set up
 * publishes it and its absence breaks every PDP. What it cannot do is tell you a
 * PDP rendered: it answers 200 regardless of the overlay, the action, or the
 * snippet. It was previously probed under the name `prerendered`, which is why a
 * fully broken storefront reported "delivery looks correct".
 */
const AUTHORED_TEMPLATE_PATH = '/products/default';

/**
 * Handle the chosen completion action.
 *
 * `undefined` means the notification was dismissed — do nothing.
 */
export async function runDiagnosticsAction(
    action: string | undefined,
    summary: string,
    logger: DebugLogger,
): Promise<void> {
    if (action === 'Copy Report') {
        await vscode.env.clipboard.writeText(summary);
        // Confirm explicitly: a silent clipboard write is indistinguishable
        // from a no-op, and the user is about to paste it somewhere.
        await vscode.window.showInformationMessage('Diagnostic report copied to clipboard.');
    } else if (action === 'Show Logs') {
        logger.show(false);
    } else if (action === 'Export Log') {
        await logger.exportDebugLog();
    }
}

export class DiagnosticsCommand {
    private logger = getLogger();

    /**
     * @param context - ExtensionContext, supplied by CommandManager which owns
     *   it. Carries the SecretStorage the GitHub credential probe needs and the
     *   context the DA.live auth service is keyed on. Taking the context rather
     *   than just `secrets` avoids holding the same thing under two names.
     */
    constructor(private context: vscode.ExtensionContext) {}

    public async execute(): Promise<void> {
        this.logger.info('Running Demo Builder diagnostics...');
        this.logger.show(false); // Show log channel and take focus

        // Clear channel for fresh diagnostics
        this.logger.clear();

        const report: DiagnosticsReport = {
            timestamp: new Date().toISOString(),
            system: {} as SystemInfo,
            vscode: {} as VSCodeInfo,
            tools: {} as ToolsInfo,
            adobe: {} as AdobeCLIInfo,
            environment: {} as EnvironmentInfo,
            tests: {} as TestResults,
            mcp: {} as McpInfo,
            githubCredential: {} as CredentialProbeResult,
        };

        try {
            // System information
            this.logger.debug('Collecting system information...');
            report.system = await getSystemInfo();

            // VS Code information
            this.logger.debug('Collecting VS Code information...');
            report.vscode = getVSCodeInfo();

            // Tool versions
            this.logger.debug('Checking tool versions...');
            report.tools = await checkTools();

            // Adobe CLI status
            this.logger.debug('Checking Adobe CLI...');
            report.adobe = await checkAdobeCLI(report.tools.aio);

            // Environment variables
            this.logger.debug('Collecting environment variables...');
            report.environment = getEnvironment();

            // Run diagnostic tests
            this.logger.debug('Running diagnostic tests...');
            report.tests = await runTests();

            // In-extension MCP server tool surface
            this.logger.debug('Probing in-extension MCP server...');
            report.mcp = await this.checkMcp();

            // The three remote probes run CONCURRENTLY: each is pure HTTP against
            // a different service (GitHub/AEM, the Config Service, aem.live), they
            // share no state, and none reads another's result — so serialising
            // them only added their latencies together.
            //
            // The `aio` checks above stay sequential on purpose. The first aio
            // command in a session triggers `aio config set
            // aio-cli-telemetry.optOut` — a write to a shared config file guarded
            // only by in-process flags — so running those concurrently would race
            // that write for a saving these three already cover.
            this.logger.debug('Probing GitHub, Config Service and storefront...');
            const [githubCredential, configService, storefront] = await Promise.all([
                this.checkGitHubCredential(),
                this.checkConfigService(),
                this.checkStorefront(),
            ]);
            report.githubCredential = githubCredential;
            report.configService = configService;
            report.storefront = storefront?.probe;
            report.storefrontScope = storefront?.scope;

            // Log the full report
            this.logger.debug('DIAGNOSTIC REPORT', report);

            // Show summary in main output, keeping the text for the clipboard
            // so a copy is exactly what the user was shown.
            const summary = this.showSummary(report);

            const action = await vscode.window.showInformationMessage(
                'Diagnostics complete. Check the output for details.',
                ...DIAGNOSTICS_ACTIONS,
            );

            await runDiagnosticsAction(action, summary, this.logger);
        } catch (error) {
            this.logger.error('Diagnostics failed', error as Error);
            throw error;
        }
    }

    /**
     * Probe the in-extension MCP server for its live tool surface. Connects to
     * the per-workspace socket and lists tools — the ground truth for what the
     * AI agent actually sees (e.g. whether `sign_in` is registered). Never
     * throws: no workspace or an unreachable socket yields a structured result.
     */
    private async checkMcp(): Promise<McpInfo> {
        // Probe the SAME socket the server binds as primary — the projects-root
        // one. Probing the workspace socket described the retired
        // one-project-one-workspace model and reported "not running" whenever no
        // folder was open, which is the normal state for this window model.
        const projectsDir = resolveProjectsRoot();
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const { primary: socketPath } = mcpSocketBindings(projectsDir, workspacePath);

        const result = await probeInExtensionMcpTools(socketPath);
        if (!result.ok) {
            return { running: false, socketPath, error: result.error };
        }

        const tools = result.tools ?? [];
        return {
            running: true,
            socketPath,
            tools,
            hasSignIn: tools.includes('sign_in'),
        };
    }

    /**
     * Probe whether the stored GitHub credential is accepted by GitHub AND by
     * AEM, and whether GitHub grants write access to the current project's repo.
     *
     * Runs without a project too — identity and granted scopes are still worth
     * having, and partial output beats none.
     */
    private async checkGitHubCredential(): Promise<CredentialProbeResult> {
        const project = await ServiceLocator.getStateManager()?.getCurrentProject();
        const repoFullName = getEdsGithubRepo(project);
        const tokenService = new GitHubTokenService(this.context.secrets, this.logger);
        return probeGitHubCredential(tokenService, repoFullName, this.logger);
    }

    /**
     * Probe what the storefront is actually SERVING.
     *
     * Every other EDS signal in this report describes the extension's own last
     * run. This one asks the live site, which is the only way to answer "is the
     * PDP fallback still installed?" without a reset.
     *
     * Returns undefined without an EDS project — same reason as the config-service
     * probe: an invented site 404s in a way that reads like a real finding.
     */
    private async checkStorefront(): Promise<
        { probe: StorefrontProbeResult; scope?: StorefrontScopeReport } | undefined
    > {
        const project = await ServiceLocator.getStateManager()?.getCurrentProject();
        const githubRepo = getEdsGithubRepo(project);
        if (!githubRepo) return undefined;

        const [owner, repo] = githubRepo.split('/');
        // Sample one real product so the probe can ask whether a PDP actually
        // renders, not merely whether the pieces are installed. Returns
        // undefined on a PaaS backend, without a Commerce endpoint, or when
        // enumeration fails — all of which must leave the storefront legs
        // reportable rather than turning a Commerce outage into a red verdict.
        const pdpTarget = project ? await pickSampleSku(project, this.logger) : undefined;
        // The CURRENTLY configured overlay URL. Note the limitation: registration
        // bakes the URL into the site config at create/reset time and nothing
        // persists it per project, so a storefront registered before the setting
        // changed is pointing somewhere this does not name. Reporting the build
        // at the current URL is still the useful answer — that is the action new
        // and reset storefronts will get — but it is not necessarily the one
        // serving THIS storefront.
        const overlayUrl = resolveByomOverlayUrl();
        const probe = await probeStorefrontDelivery(
            owner,
            repo,
            this.logger,
            AUTHORED_TEMPLATE_PATH,
            pdpTarget && { path: pdpTarget.path, sku: pdpTarget.sku },
            overlayUrl,
        );
        return {
            probe,
            // Only meaningful when a SKU was actually sampled — without one there
            // is no scope to report against.
            scope: pdpTarget && {
                source: pdpTarget.scopeSource,
                divergence: pdpTarget.scopeDivergence,
            },
        };
    }

    /**
     * Probe whether the DA.live credential can read this storefront's site
     * config, and whether the same credential is accepted by DA.live itself.
     *
     * Returns undefined without an EDS project: there is no site to address,
     * and an invented one would produce a 404 that reads like a real finding.
     */
    private async checkConfigService(): Promise<ConfigServiceProbeResult | undefined> {
        const project = await ServiceLocator.getStateManager()?.getCurrentProject();
        const target = getEdsDaLiveTarget(project);
        if (!target) return undefined;

        const daLiveAuthService = getDaLiveAuthService(this.context);
        const tokenProvider = createDaLiveServiceTokenProvider(daLiveAuthService);
        return probeConfigService(tokenProvider, target.org, target.site, this.logger);
    }

    /**
     * Write the summary to the user log and return it as text.
     *
     * Returns the same lines it logs so the "Copy Report" action can hand the
     * user exactly what they just read, rather than the whole output channel.
     */
    private showSummary(report: DiagnosticsReport): string {
        const lines = buildSummaryLines(report);
        for (const line of lines) this.logger.info(line);
        return lines.join('\n');
    }
}
