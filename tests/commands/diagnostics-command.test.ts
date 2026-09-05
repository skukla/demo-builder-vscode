/**
 * `DiagnosticsCommand` — what the run COLLECTS, as opposed to how it reads.
 *
 * The two sibling suites (`-copyReport`, `-credentialService`) both drive
 * `buildSummaryLines`, which lives in `diagnosticsReport.ts`. Nothing exercised
 * the command itself: measured 2026-09-05, every decision in this file below
 * `runDiagnosticsAction` was uncovered — the four concurrent probes, the two
 * "no EDS project" guards, the MCP result mapping, and the PII redaction that
 * keeps colleague addresses out of an exportable log buffer.
 *
 * These assert the ARGUMENTS each collaborator receives and the report object
 * that comes back, never a log message: a mock answers the same whatever it is
 * handed, so asserting its answer would test the mock.
 */

jest.mock('@/core/di/serviceLocator');
jest.mock('@/commands/claudeCodeFootprint', () => ({
    // `diagnosticsReport` renders with the REAL `claudeFootprintLines`, so this
    // module may not be automocked wholesale — only the collector is stubbed.
    ...jest.requireActual('@/commands/claudeCodeFootprint'),
    collectClaudeCodeFootprint: jest.fn(),
}));
jest.mock('@/commands/diagnosticsChecks', () => ({
    checkAdobeCLI: jest.fn(),
    checkOrphanedSettings: jest.fn(),
    checkTools: jest.fn(),
    getEnvironment: jest.fn(),
    getSystemInfo: jest.fn(),
    getVSCodeInfo: jest.fn(),
    runTests: jest.fn(),
}));
jest.mock('@/core/logging/debugLogger', () => ({
    ...jest.requireActual('@/core/logging/debugLogger'),
    getLogger: jest.fn(() => mockDebugLogger),
}));
jest.mock('@/core/utils/mcpSocketPath', () => ({ resolveMcpSocketPath: jest.fn(() => SOCKET) }));
jest.mock('@/core/utils/projectsRoot', () => ({ resolveProjectsRoot: jest.fn(() => '/projects') }));
jest.mock('@/features/ai/server/mcpToolProbe', () => ({ probeInExtensionMcpTools: jest.fn() }));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getDaLiveAuthService: jest.fn(() => mockDaLiveAuthService),
    resolveByomOverlayUrl: jest.fn(() => OVERLAY_URL),
}));
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: jest.fn(() => ({ tokenService: mockTokenService })),
}));
jest.mock('@/features/eds/services/catalogPrewarmService', () => ({ pickSampleSku: jest.fn() }));
jest.mock('@/features/eds/services/configService/configServiceProbe', () => ({
    probeConfigService: jest.fn(),
}));
jest.mock('@/features/eds/services/credentialServiceProbe', () => ({
    probeCredentialService: jest.fn(),
}));
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => mockTokenProvider),
}));
jest.mock('@/features/eds/services/github/githubCredentialProbe', () => ({
    probeGitHubCredential: jest.fn(),
}));
jest.mock('@/features/eds/services/storefront/storefrontProbe', () => ({
    probeStorefrontDelivery: jest.fn(),
}));

import * as vscode from 'vscode';
import { collectClaudeCodeFootprint } from '@/commands/claudeCodeFootprint';
import { DiagnosticsCommand } from '@/commands/diagnostics';
import type { DiagnosticsReport } from '@/commands/diagnostics';
import {
    checkAdobeCLI,
    checkOrphanedSettings,
    checkTools,
    getEnvironment,
    getSystemInfo,
    getVSCodeInfo,
    runTests,
} from '@/commands/diagnosticsChecks';
import type {
    AdobeCLIInfo,
    EnvironmentInfo,
    SystemInfo,
    TestResults,
    ToolsInfo,
    VSCodeInfo,
} from '@/commands/diagnosticsReport';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { probeInExtensionMcpTools } from '@/features/ai/server/mcpToolProbe';
import { pickSampleSku } from '@/features/eds/services/catalogPrewarmService';
import type { SamplePdp } from '@/features/eds/services/catalogPrewarmService';
import { probeConfigService } from '@/features/eds/services/configService/configServiceProbe';
import type { ConfigServiceProbeResult } from '@/features/eds/services/configService/configServiceProbe';
import { probeCredentialService } from '@/features/eds/services/credentialServiceProbe';
import type { CredentialServiceProbeResult } from '@/features/eds/services/credentialServiceProbe';
import { probeGitHubCredential } from '@/features/eds/services/github/githubCredentialProbe';
import type { CredentialProbeResult } from '@/features/eds/services/github/githubCredentialProbe';
import { probeStorefrontDelivery } from '@/features/eds/services/storefront/storefrontProbe';
import type { StorefrontProbeResult } from '@/features/eds/services/storefront/storefrontProbe';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';
import { createMockAuthenticationService } from '../helpers/authenticationServiceFake';
import { createMockDebugLogger } from '../helpers/debugLoggerFake';
import { createMockExtensionContext } from '../helpers/extensionContextFake';
import { createMockLogger } from '../helpers/loggerFake';
import { createMockProject } from '../helpers/projectFake';
import { createMockStateManager } from '../helpers/stateManagerFake';

const SOCKET = '/projects/.mcp-abc123.sock';
const OVERLAY_URL = 'https://example.com/api/v1/web/pdp/render-pdp';
const REPO = 'acme/demo-storefront';

/** Referenced by the hoisted factories above; only read once a test runs. */
const mockDebugLogger = createMockDebugLogger();
const mockTokenService = { getToken: jest.fn() };
const mockDaLiveAuthService = { getAccessToken: jest.fn() };
const mockTokenProvider = { getAccessToken: jest.fn() };
const mockAuthService = createMockAuthenticationService();

const TOOL = { installed: true, duration: 1 };
const TOOLS: ToolsInfo = { node: TOOL, npm: TOOL, fnm: TOOL, git: TOOL, aio: TOOL };
const SYSTEM: SystemInfo = {
    platform: 'darwin',
    release: '25.6.0',
    arch: 'arm64',
    cpus: 10,
    memory: '32 GB',
    homedir: '/home/sc',
    tmpdir: '/tmp',
    shell: '/bin/zsh',
};
const VSCODE_INFO: VSCodeInfo = {
    version: '1.99.0',
    appName: 'Visual Studio Code',
    language: 'en',
    machineId: 'machine',
    sessionId: 'session',
};
const ADOBE: AdobeCLIInfo = { installed: true, version: '11.1.2', authConfigured: true };
const ENVIRONMENT: EnvironmentInfo = {
    PATH: ['/usr/bin'],
    HOME: '/home/sc',
    USER: 'sc',
    SHELL: '/bin/zsh',
    NODE_PATH: undefined,
    npm_config_prefix: undefined,
    FNM_DIR: undefined,
    FNM_MULTISHELL_PATH: undefined,
    FNM_NODE_DIST_MIRROR: undefined,
    FNM_LOGLEVEL: undefined,
};
const TESTS: TestResults = {
    browserLaunch: { platform: 'darwin', command: 'open', available: true },
    adobeLoginCommand: { available: true, supportsForceFlag: true },
    fileSystem: { canWrite: true, canRead: true, tempDir: '/tmp' },
};
const GITHUB_PROBE: CredentialProbeResult = {
    github: { reachable: true, login: 'sc' },
    verdict: 'GitHub accepts the credential.',
};
const STOREFRONT_PROBE: StorefrontProbeResult = {
    baseUrl: 'https://main--demo-storefront--acme.aem.live',
    site: { reachable: true, status: 200 },
    verdict: 'Storefront delivery looks correct.',
};
const CREDENTIAL_SERVICE: CredentialServiceProbeResult = {
    configured: true,
    endpoint: { httpStatus: 200 },
    verdict: 'Shared credential available.',
};
const SAMPLE_PDP: SamplePdp = {
    sku: 'ADB-1',
    urlKey: 'adb-1',
    path: '/products/adb-1/ADB_2D1',
    scopeSource: 'served',
};

/** An EDS project whose storefront instance carries the GitHub repo. */
function edsProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        selectedStack: 'eds-accs',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: REPO },
            },
        },
        ...overrides,
    });
}

interface Harness {
    command: DiagnosticsCommand;
    logger: jest.Mocked<Logger>;
}

function setup(project: Project | null = null): Harness {
    const logger = createMockLogger();
    const stateManager = createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(project),
    });
    const command = new DiagnosticsCommand(createMockExtensionContext(), stateManager, logger);
    return { command, logger };
}

/**
 * The report the run assembled, read off the one debug call that carries an
 * OBJECT. Keyed on the shape rather than the message so this does not pin
 * wording — and so a redaction that returns nothing fails loudly here.
 */
function reportFrom(logger: jest.Mocked<Logger>): DiagnosticsReport {
    const call = logger.debug.mock.calls.find(
        (args) => typeof args[1] === 'object' && args[1] !== null,
    );
    if (!call) throw new Error('the diagnostics run logged no report object');
    return call[1] as DiagnosticsReport;
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(ServiceLocator.getAuthenticationService).mockReturnValue(mockAuthService);
    jest.mocked(getSystemInfo).mockResolvedValue(SYSTEM);
    jest.mocked(getVSCodeInfo).mockReturnValue(VSCODE_INFO);
    jest.mocked(checkTools).mockResolvedValue(TOOLS);
    jest.mocked(checkAdobeCLI).mockResolvedValue(ADOBE);
    jest.mocked(getEnvironment).mockReturnValue(ENVIRONMENT);
    jest.mocked(checkOrphanedSettings).mockReturnValue([]);
    jest.mocked(runTests).mockResolvedValue(TESTS);
    jest.mocked(collectClaudeCodeFootprint).mockResolvedValue({ root: '/home/sc/.claude', exists: false });
    jest.mocked(probeInExtensionMcpTools).mockResolvedValue({ ok: true, tools: ['sign_in', 'get_status'] });
    jest.mocked(probeGitHubCredential).mockResolvedValue(GITHUB_PROBE);
    jest.mocked(probeStorefrontDelivery).mockResolvedValue(STOREFRONT_PROBE);
    jest.mocked(probeCredentialService).mockResolvedValue(CREDENTIAL_SERVICE);
    jest.mocked(probeConfigService).mockResolvedValue({ token: { present: true }, verdict: 'ok' });
    jest.mocked(pickSampleSku).mockResolvedValue(SAMPLE_PDP);
    // `as jest.Mock`, the house pattern: the real signature is four overloads and
    // `jest.mocked` resolves to the MessageItem one, which is not what the command
    // calls — the action strings are the last argument of the string overload.
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
});

describe('the four remote probes', () => {
    it('asks GitHub about the project’s own repo, with the command’s token service', async () => {
        const { command, logger } = setup(edsProject());

        await command.execute();

        expect(probeGitHubCredential).toHaveBeenCalledWith(mockTokenService, REPO, logger);
    });

    it('still probes GitHub with no repo when no project is open', async () => {
        // Identity and granted scopes are worth having without a project;
        // partial output beats none.
        const { command, logger } = setup(null);

        await command.execute();

        expect(probeGitHubCredential).toHaveBeenCalledWith(mockTokenService, undefined, logger);
    });

    it('probes the Config Service under the GITHUB owner and repo', async () => {
        // Not the DA.live pair: site configs are keyed at
        // /config/{owner}/sites/{repo}.json, and probing the other pair reads a
        // different site config on any project where the two names differ.
        const { command, logger } = setup(edsProject());

        await command.execute();

        expect(probeConfigService).toHaveBeenCalledWith(
            mockTokenProvider,
            'acme',
            'demo-storefront',
            logger,
        );
    });

    it('does not probe the Config Service when there is no EDS repo', async () => {
        // An invented site 404s in a way that reads like a real finding.
        const { command } = setup(null);

        await command.execute();

        expect(probeConfigService).not.toHaveBeenCalled();
    });

    it('probes the credential service with the project’s Adobe org', async () => {
        const { command } = setup(edsProject());

        await command.execute();

        expect(probeCredentialService).toHaveBeenCalledWith({
            auth: mockAuthService,
            orgId: '285361',
        });
    });

    it('omits the org rather than sending an empty one when the project has none', async () => {
        const { command } = setup(edsProject({ adobe: undefined }));

        await command.execute();

        expect(probeCredentialService).toHaveBeenCalledWith({ auth: mockAuthService });
    });

    it('runs the credential probe with no project at all — it is a global capability', async () => {
        const { command } = setup(null);

        await command.execute();

        expect(probeCredentialService).toHaveBeenCalledWith({ auth: mockAuthService });
    });
});

describe('the MCP section', () => {
    it('reports the live tool surface and the socket it probed', async () => {
        const { command, logger } = setup(null);

        await command.execute();

        expect(probeInExtensionMcpTools).toHaveBeenCalledWith(SOCKET);
        expect(reportFrom(logger).mcp).toEqual({
            running: true,
            socketPath: SOCKET,
            tools: ['sign_in', 'get_status'],
            hasSignIn: true,
        });
    });

    it('reports an EMPTY roster rather than inventing one when the server lists none', async () => {
        jest.mocked(probeInExtensionMcpTools).mockResolvedValue({ ok: true });
        const { command, logger } = setup(null);

        await command.execute();

        expect(reportFrom(logger).mcp).toEqual({
            running: true,
            socketPath: SOCKET,
            tools: [],
            hasSignIn: false,
        });
    });

    it('reports the server as NOT running, carrying the probe’s reason', async () => {
        jest.mocked(probeInExtensionMcpTools).mockResolvedValue({ ok: false, error: 'ENOENT' });
        const { command, logger } = setup(null);

        await command.execute();

        expect(reportFrom(logger).mcp).toEqual({
            running: false,
            socketPath: SOCKET,
            error: 'ENOENT',
        });
    });
});

describe('the storefront section', () => {
    it('probes the live site with the sampled SKU and the configured overlay URL', async () => {
        const { command, logger } = setup(edsProject());

        await command.execute();

        expect(probeStorefrontDelivery).toHaveBeenCalledWith(
            'acme',
            'demo-storefront',
            logger,
            '/products/default',
            { path: SAMPLE_PDP.path, sku: SAMPLE_PDP.sku },
            OVERLAY_URL,
        );
    });

    it('records the probe and the scope the SKU sample came from', async () => {
        const { command, logger } = setup(edsProject());

        await command.execute();

        const report = reportFrom(logger);
        expect(report.storefront).toEqual(STOREFRONT_PROBE);
        expect(report.storefrontScope).toEqual({ source: 'served' });
    });

    it('reports the storefront with NO scope when no SKU could be sampled', async () => {
        // Undefined on a PaaS backend, without a Commerce endpoint, or when
        // enumeration fails — none of which may turn into a red verdict.
        jest.mocked(pickSampleSku).mockResolvedValue(undefined);
        const { command, logger } = setup(edsProject());

        await command.execute();

        const report = reportFrom(logger);
        expect(report.storefront).toEqual(STOREFRONT_PROBE);
        expect(report.storefrontScope).toBeUndefined();
        expect(probeStorefrontDelivery).toHaveBeenCalledWith(
            'acme',
            'demo-storefront',
            logger,
            '/products/default',
            undefined,
            OVERLAY_URL,
        );
    });

    it('leaves the storefront legs out entirely when there is no EDS repo', async () => {
        const { command, logger } = setup(null);

        await command.execute();

        const report = reportFrom(logger);
        expect(probeStorefrontDelivery).not.toHaveBeenCalled();
        expect(report.storefront).toBeUndefined();
        expect(report.storefrontScope).toBeUndefined();
    });
});

describe('the report it logs', () => {
    const withAdmins = (emails?: string[]): ConfigServiceProbeResult => ({
        token: { present: true },
        configService: { httpStatus: 403 },
        ...(emails ? { orgAdmins: { status: 'ok' as const, emails } } : {}),
        verdict: 'refused',
    });

    it('MASKS org admin addresses — this buffer is exportable', async () => {
        // Dumping the object verbatim would put colleague PII into a file users
        // attach to tickets, one layer below the masking the rendered report does.
        jest.mocked(probeConfigService).mockResolvedValue(withAdmins(['owner@adobe.com']));
        const { command, logger } = setup(edsProject());

        await command.execute();

        expect(reportFrom(logger).configService?.orgAdmins?.emails).toEqual(['o****r@adobe.com']);
    });

    it('leaves a report with no admin roster exactly as the probe returned it', async () => {
        jest.mocked(probeConfigService).mockResolvedValue(withAdmins());
        const { command, logger } = setup(edsProject());

        await command.execute();

        expect(reportFrom(logger).configService).toEqual(withAdmins());
    });

    it('logs a report even when no EDS project supplies a config service at all', async () => {
        const { command, logger } = setup(null);

        await command.execute();

        const report = reportFrom(logger);
        expect(report.configService).toBeUndefined();
        expect(report.githubCredential).toEqual(GITHUB_PROBE);
        expect(report.credentialService).toEqual(CREDENTIAL_SERVICE);
    });

    it('stamps the report with the moment the run happened', async () => {
        const { command, logger } = setup(null);

        await command.execute();

        expect(reportFrom(logger).timestamp).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    });
});

describe('the completion notification', () => {
    it('copies EXACTLY the summary it showed, when Copy Report is chosen', async () => {
        (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Copy Report');
        const { command } = setup(null);

        await command.execute();

        const copied = jest.mocked(vscode.env.clipboard.writeText).mock.calls[0]?.[0];
        expect(typeof copied).toBe('string');
        expect(copied).toContain('DIAGNOSTICS SUMMARY');
        expect(copied).toContain('MCP Server (in-extension):');
    });

    it('rethrows a collector failure instead of reporting a run that did not happen', async () => {
        jest.mocked(checkTools).mockRejectedValue(new Error('spawn failed'));
        const { command } = setup(null);

        await expect(command.execute()).rejects.toThrow('spawn failed');
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });
});
