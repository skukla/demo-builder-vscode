/**
 * componentInstallationOrchestrator — both PHASES, and the MCP-tools install.
 *
 * Phase 1 (cloning) had no test at all until 2026-09-04: where components land,
 * what options each clone is handed, what a failed clone does, and whether an
 * existing component record survives were all unconstrained. Those tests live
 * in the second describe below.
 *
 * Pins the load-bearing safety contract of the isolated MCP-tools install
 * (see aiDefaultsInstaller / ADR-style fix): for EDS projects the orchestrator
 * installs the ai-defaults MCP packages into the per-project isolated dir, but
 * a failure there MUST be NON-FATAL — project creation must never abort because
 * optional AI tooling couldn't install. Non-EDS projects skip it entirely.
 */

import * as fsPromises from 'fs/promises';
import {
    cloneAllComponents,
    installAllComponents,
    type InstallationContext,
} from '@/features/project-creation/services/componentInstallationOrchestrator';
import { COMPONENT_IDS } from '@/core/constants';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import type { ComponentInstance } from '@/types/base';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

const mockInstallNpmDependencies = jest.fn();
const mockInstallComponent = jest.fn();
jest.mock('@/features/components/services/componentManager', () => ({
    ComponentManager: jest.fn().mockImplementation(() => ({
        installComponent: (...args: unknown[]) => mockInstallComponent(...args),
        installNpmDependencies: (...args: unknown[]) => mockInstallNpmDependencies(...args),
    })),
}));

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
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
            expect.any(Function),
            // The installer needs a logger or an npm EBADENGINE warning reaches
            // no channel at all — npm exits 0 on it.
            expect.objectContaining({ warn: expect.any(Function) })
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
            expect.any(Function),
            // The installer needs a logger or an npm EBADENGINE warning reaches
            // no channel at all — npm exits 0 on it.
            expect.objectContaining({ warn: expect.any(Function) })
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

/** One catalog entry, narrowed the way the sibling suite narrows it. */
function definitions(
    ids: string[],
    installOptions: { skipDependencies?: boolean } = { skipDependencies: true }
): InstallationContext['componentDefinitions'] {
    return new Map(
        ids.map((id) => [id, { definition: { name: id }, type: 'frontend', installOptions }])
    ) as unknown as InstallationContext['componentDefinitions'];
}

function makePhaseContext(
    overrides: {
        ids?: string[];
        componentInstances?: Record<string, ComponentInstance> | undefined;
        componentsDir?: string;
    } = {}
): InstallationContext {
    const project = createMockProject({
        name: 'Test',
        path: '/proj',
        componentInstances: overrides.componentInstances,
    });
    return {
        project,
        componentDefinitions: definitions(overrides.ids ?? ['alpha']),
        progressTracker: jest.fn(),
        logger: createMockLogger() as unknown as Logger,
        saveProject: jest.fn(async () => undefined),
        commandManager: createMockCommandExecutor({ execute: jest.fn() }),
        componentsDir: overrides.componentsDir,
    };
}

/** What ComponentManager hands back for a successful clone of `id`. */
function clonedInstance(id: string): ComponentInstance {
    return {
        id,
        name: id,
        status: 'not-installed',
        path: `/proj/components/${id}`,
    };
}

/** The collaborator answers both phase describes start from. */
function resetPhaseCollaborators(): void {
    jest.clearAllMocks();
    (fsPromises.mkdir as jest.Mock).mockResolvedValue(undefined);
    mockInstallComponent.mockImplementation(async (_p, definition: { name: string }) => ({
        success: true,
        component: clonedInstance(definition.name),
    }));
    mockInstallNpmDependencies.mockResolvedValue({ success: true });
    mockInstallAiDefaultsMcpTools.mockResolvedValue({ success: true });
}

describe('cloneAllComponents — phase 1', () => {
    beforeEach(resetPhaseCollaborators);

    it('creates the default components directory and records every clone', async () => {
        const ctx = makePhaseContext({ ids: ['alpha', 'beta'], componentInstances: undefined });

        await expect(cloneAllComponents(ctx)).resolves.toBeUndefined();

        expect(fsPromises.mkdir).toHaveBeenCalledWith('/proj/components', { recursive: true });
        expect(mockInstallComponent).toHaveBeenCalledWith(
            ctx.project,
            { name: 'alpha' },
            { skipDependencies: true }
        );
        expect(ctx.project.componentInstances).toEqual({
            alpha: clonedInstance('alpha'),
            beta: clonedInstance('beta'),
        });
        expect(ctx.saveProject).toHaveBeenCalled();
    });

    it('clones into the override directory and passes it through to each component', async () => {
        const ctx = makePhaseContext({ componentsDir: '/tmp/edit-swap', componentInstances: {} });

        await cloneAllComponents(ctx);

        expect(fsPromises.mkdir).toHaveBeenCalledWith('/tmp/edit-swap', { recursive: true });
        expect(mockInstallComponent).toHaveBeenCalledWith(
            ctx.project,
            { name: 'alpha' },
            { skipDependencies: true, componentsDir: '/tmp/edit-swap' }
        );
    });

    it('keeps component records the project already had', async () => {
        const existing = { ...clonedInstance('preexisting'), status: 'ready' as const };
        const ctx = makePhaseContext({ componentInstances: { preexisting: existing } });

        await cloneAllComponents(ctx);

        expect(ctx.project.componentInstances).toEqual({
            preexisting: existing,
            alpha: clonedInstance('alpha'),
        });
    });

    it('fails the whole phase when a clone reports failure', async () => {
        mockInstallComponent.mockResolvedValue({ success: false, error: 'network down' });
        const ctx = makePhaseContext();

        await expect(cloneAllComponents(ctx)).rejects.toThrow(
            'Failed to clone alpha: network down'
        );
    });

    it('fails the whole phase when a clone reports success but returns no component', async () => {
        mockInstallComponent.mockResolvedValue({ success: true, component: undefined });
        const ctx = makePhaseContext();

        await expect(cloneAllComponents(ctx)).rejects.toThrow('Failed to clone alpha');
        expect(ctx.saveProject).not.toHaveBeenCalled();
    });
});

describe('installAllComponents — phase 2', () => {
    beforeEach(resetPhaseCollaborators);

    it('installs each component from its recorded path and marks it ready', async () => {
        const ctx = makePhaseContext({
            componentInstances: { alpha: { ...clonedInstance('alpha'), status: 'installing' } },
        });

        await installAllComponents(ctx);

        expect(mockInstallNpmDependencies).toHaveBeenCalledWith('/proj/components/alpha', {
            name: 'alpha',
        });
        expect(ctx.project.componentInstances!.alpha.status).toBe('ready');
        expect(ctx.project.componentInstances!.alpha.lastUpdated).toBeInstanceOf(Date);
    });

    it('does nothing for a project that recorded no component instances at all', async () => {
        const ctx = makePhaseContext({ componentInstances: undefined });

        await expect(installAllComponents(ctx)).resolves.toBeUndefined();
        expect(mockInstallNpmDependencies).not.toHaveBeenCalled();
    });

    it('skips a definition whose component was never recorded', async () => {
        const ctx = makePhaseContext({
            ids: ['alpha'],
            componentInstances: { beta: clonedInstance('beta') },
        });

        await expect(installAllComponents(ctx)).resolves.toBeUndefined();
        expect(mockInstallNpmDependencies).not.toHaveBeenCalled();
    });

    it('fails the whole phase when npm install fails for one component', async () => {
        mockInstallNpmDependencies.mockResolvedValue({ success: false, error: 'EBADENGINE' });
        const ctx = makePhaseContext({
            componentInstances: { alpha: clonedInstance('alpha') },
        });

        await expect(installAllComponents(ctx)).rejects.toThrow(
            'Failed to install alpha: EBADENGINE'
        );
    });
});
