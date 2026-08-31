/**
 * componentInstallationOrchestrator — MCP-tools install at component-install time.
 *
 * Pins the load-bearing safety contract of the isolated MCP-tools install
 * (see aiDefaultsInstaller / ADR-style fix): for EDS projects the orchestrator
 * installs the ai-defaults MCP packages into the per-project isolated dir, but
 * a failure there MUST be NON-FATAL — project creation must never abort because
 * optional AI tooling couldn't install. Non-EDS projects skip it entirely.
 */

import {
    installAllComponents,
    type InstallationContext,
} from '@/features/project-creation/services/componentInstallationOrchestrator';
import { COMPONENT_IDS } from '@/core/constants';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import type { ComponentInstance } from '@/types';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

const mockInstallNpmDependencies = jest.fn();
jest.mock('@/features/components/services/componentManager', () => ({
    ComponentManager: jest.fn().mockImplementation(() => ({
        installNpmDependencies: (...args: unknown[]) => mockInstallNpmDependencies(...args),
    })),
}));

const mockInstallAiDefaultsMcpTools = jest.fn();
jest.mock('@/features/project-creation/services/aiBundle/aiDefaultsInstaller', () => ({
    installAiDefaultsMcpTools: (...args: unknown[]) => mockInstallAiDefaultsMcpTools(...args),
    resolveMcpToolsDir: (projectPath: string) => `${projectPath}/.demo-builder-mcp`,
}));

function makeContext(
    // `{ path }` alone is not a ComponentInstance — the real one carries id, type,
    // status and more. Typed loosely here, it reached the Project fixture as a
    // component-instance record and only the builder's typing objected.
    componentInstances: Record<string, Partial<ComponentInstance>>,
): InstallationContext {
    const logger = createMockLogger() as unknown as Logger;
    // Only the definition MAP is narrowed — the context itself is built to its
    // real shape. A whole-object cast here used to hide missing fields (it was
    // short `saveProject`, and silently absorbed `commandManager` when ADR-015
    // added it, so the suite failed at runtime with a green typecheck).
    const componentDefinitions = new Map(
        Object.keys(componentInstances).map((compId) => [compId, { definition: { name: compId } }])
    ) as unknown as InstallationContext['componentDefinitions'];
    return {
        project: createMockProject({
            name: 'Test',
            path: '/proj',
            componentInstances: componentInstances as Record<string, ComponentInstance>,
        }),
        componentDefinitions,
        progressTracker: jest.fn(),
        logger,
        saveProject: jest.fn(async () => undefined),
        commandManager: createMockCommandExecutor({ execute: jest.fn() }),
    };
}

describe('installAllComponents — isolated MCP-tools install contract', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockInstallNpmDependencies.mockResolvedValue({ success: true });
    });

    it('installs MCP tools into the isolated dir (by project.path) for EDS projects', async () => {
        mockInstallAiDefaultsMcpTools.mockResolvedValue({ success: true });
        const ctx = makeContext({
            [COMPONENT_IDS.EDS_STOREFRONT]: { path: '/proj/components/eds-storefront' },
        });

        await installAllComponents(ctx);

        expect(mockInstallAiDefaultsMcpTools).toHaveBeenCalledWith(
            '/proj',
            expect.objectContaining({ path: '/proj' }),
            expect.anything(),
            expect.any(Function)
        );
    });

    it('installs MCP tools for mesh projects too (App Builder-adjacent, no storefront)', async () => {
        mockInstallAiDefaultsMcpTools.mockResolvedValue({ success: true });
        const ctx = makeContext({
            [COMPONENT_IDS.HEADLESS_COMMERCE_MESH]: { path: '/proj/components/mesh' },
        });

        await installAllComponents(ctx);

        expect(mockInstallAiDefaultsMcpTools).toHaveBeenCalledWith(
            '/proj',
            expect.objectContaining({ path: '/proj' }),
            expect.anything(),
            expect.any(Function)
        );
    });

    it('does NOT abort creation when the MCP-tools install fails (non-fatal)', async () => {
        mockInstallAiDefaultsMcpTools.mockResolvedValue({ success: false, error: 'npm boom' });
        const ctx = makeContext({
            [COMPONENT_IDS.EDS_STOREFRONT]: { path: '/proj/components/eds-storefront' },
        });

        await expect(installAllComponents(ctx)).resolves.toBeUndefined();
        expect(ctx.logger.warn as jest.Mock).toHaveBeenCalledWith(
            expect.stringContaining('non-fatal')
        );
    });

    it('skips the MCP-tools install when no storefront, mesh, or app-builder component exists', async () => {
        mockInstallAiDefaultsMcpTools.mockResolvedValue({ success: true });
        const ctx = makeContext({
            'citisignal-nextjs': { path: '/proj/components/citisignal-nextjs' },
        });

        await installAllComponents(ctx);

        expect(mockInstallAiDefaultsMcpTools).not.toHaveBeenCalled();
    });
});
