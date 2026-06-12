/**
 * componentInstallationOrchestrator — MCP-tools install at component-install time.
 *
 * Pins the load-bearing safety contract of the isolated MCP-tools install
 * (see aiDefaultsInstaller / ADR-style fix): for EDS projects the orchestrator
 * installs the ai-defaults MCP packages into the per-project isolated dir, but
 * a failure there MUST be NON-FATAL — project creation must never abort because
 * optional AI tooling couldn't install. Non-EDS projects skip it entirely.
 */

import { installAllComponents, type InstallationContext } from '@/features/project-creation/services/componentInstallationOrchestrator';
import { COMPONENT_IDS } from '@/core/constants';
import type { Logger } from '@/core/logging';
import type { Project } from '@/types';

const mockInstallNpmDependencies = jest.fn();
jest.mock('@/features/components/services/ComponentManager', () => ({
    ComponentManager: jest.fn().mockImplementation(() => ({
        installNpmDependencies: (...args: unknown[]) => mockInstallNpmDependencies(...args),
    })),
}));

const mockInstallAiDefaultsMcpTools = jest.fn();
jest.mock('@/features/project-creation/services/aiDefaultsInstaller', () => ({
    installAiDefaultsMcpTools: (...args: unknown[]) => mockInstallAiDefaultsMcpTools(...args),
    resolveMcpToolsDir: (projectPath: string) => `${projectPath}/.demo-builder-mcp`,
}));

function makeContext(componentInstances: Record<string, { path: string }>): InstallationContext {
    const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;
    const componentDefinitions = new Map(
        Object.keys(componentInstances).map((compId) => [compId, { definition: { name: compId } }]),
    );
    return {
        project: { name: 'Test', path: '/proj', componentInstances } as unknown as Project,
        componentDefinitions,
        progressTracker: jest.fn(),
        logger,
    } as unknown as InstallationContext;
}

describe('installAllComponents — isolated MCP-tools install contract', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockInstallNpmDependencies.mockResolvedValue({ success: true });
    });

    it('installs MCP tools into the isolated dir (by project.path) for EDS projects', async () => {
        mockInstallAiDefaultsMcpTools.mockResolvedValue({ success: true });
        const ctx = makeContext({ [COMPONENT_IDS.EDS_STOREFRONT]: { path: '/proj/components/eds-storefront' } });

        await installAllComponents(ctx);

        expect(mockInstallAiDefaultsMcpTools).toHaveBeenCalledWith('/proj');
    });

    it('does NOT abort creation when the MCP-tools install fails (non-fatal)', async () => {
        mockInstallAiDefaultsMcpTools.mockResolvedValue({ success: false, error: 'npm boom' });
        const ctx = makeContext({ [COMPONENT_IDS.EDS_STOREFRONT]: { path: '/proj/components/eds-storefront' } });

        await expect(installAllComponents(ctx)).resolves.toBeUndefined();
        expect((ctx.logger.warn as jest.Mock)).toHaveBeenCalledWith(expect.stringContaining('non-fatal'));
    });

    it('skips the MCP-tools install for non-EDS (headless) projects', async () => {
        mockInstallAiDefaultsMcpTools.mockResolvedValue({ success: true });
        const ctx = makeContext({ 'citisignal-nextjs': { path: '/proj/components/citisignal-nextjs' } });

        await installAllComponents(ctx);

        expect(mockInstallAiDefaultsMcpTools).not.toHaveBeenCalled();
    });
});
