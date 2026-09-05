/**
 * appBuilderComponentHandlers — the shared plumbing under every handler.
 *
 * The three handler suites drive whole operations; these are the pieces each of
 * them passes through and none of them isolates: the guard chain and its typed
 * refusals, the payload → catalog-entry resolution both the button and the MCP
 * tool must reach the same verdict from, the four push channels, and the
 * toolchain-refresh consent, which is the ONE place where the agent surface and
 * the human surface deliberately answer differently.
 *
 * Every assertion names the arguments a collaborator receives. A guard that
 * refuses without the right `code` looks identical to one that refuses correctly
 * unless the code is read: the UI decides between offering "Sign in" and
 * offering "Retry" from that field alone.
 */

import {
    buildToolchainConsent,
    ERP_ENTRY,
    guardOrBlock,
    handleAddAppBuilderComponent,
    handleDeployAppBuilderComponent,
    handleRemoveAppBuilderComponent,
    handleRenameAppBuilderComponent,
    mockBuildCustomIntegrationEntry,
    mockBuildDefaultRunnerDeps,
    mockDetectProjectOrgMismatch,
    mockEnsureAdobeIOAuth,
    mockGetAppBuilderComponentEntry,
    mockSendAppBuilderComponentStatusUpdate,
    mockSendAppBuilderComponentsSnapshot,
    mockSendMeshStatusUpdate,
    mockSendProjectDestinationUpdate,
    mockTestDeveloperPermissions,
    postComponentsSnapshot,
    postDestination,
    postMeshStatus,
    postRowStatus,
    resetHandlerMocks,
    resolveAddEntry,
    resolveComponentTarget,
    runGuards,
    setupMocks,
    userSuppliedEnvVars,
    vscodeMock,
    withComponentProgress,
} from './appBuilderComponentHandlers.testUtils';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import { ErrorCode } from '@/types/errorCodes';

beforeEach(() => {
    resetHandlerMocks();
});

describe('runGuards — auth, then org, then permission', () => {
    it('passes the project Adobe coordinates to the sign-in guard', async () => {
        const { mockContext, mockProject } = setupMocks({
            adobe: { organization: 'Acme', projectId: 'p1', workspace: 'Stage' },
        });
        mockTestDeveloperPermissions(true);

        await expect(runGuards(mockContext, mockProject)).resolves.toBeUndefined();
        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                logPrefix: '[AppBuilderComponents]',
                projectContext: {
                    organization: 'Acme',
                    projectId: 'p1',
                    workspace: 'Stage',
                },
                warningMessage: 'Adobe sign-in required to manage App Builder components.',
            })
        );
    });

    it('sends undefined coordinates for a project with no Adobe block', async () => {
        const { mockContext, mockProject } = setupMocks({ adobe: undefined });
        mockTestDeveloperPermissions(true);

        await runGuards(mockContext, mockProject);

        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                projectContext: {
                    organization: undefined,
                    projectId: undefined,
                    workspace: undefined,
                },
            })
        );
    });

    it('refuses a failed sign-in with a code the UI can act on', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });

        await expect(runGuards(mockContext, mockProject)).resolves.toEqual({
            error: 'Adobe sign-in required.',
            // Not a Retry: only signing in fixes it, and the picker reads this
            // field to decide which action to offer.
            code: ErrorCode.AUTH_REQUIRED,
        });
        expect(mockDetectProjectOrgMismatch).not.toHaveBeenCalled();
    });

    it('refuses an unreachable org WITHOUT a code — retrying cannot fix it either', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockDetectProjectOrgMismatch.mockResolvedValue({ reachable: false });

        await expect(runGuards(mockContext, mockProject)).resolves.toEqual({
            error: 'Project uses a different Adobe organization. Use "Switch IMS Org" to continue.',
        });
    });

    it('continues when the org check has nothing to say', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockDetectProjectOrgMismatch.mockResolvedValue(undefined);
        mockTestDeveloperPermissions(true);

        await expect(runGuards(mockContext, mockProject)).resolves.toBeUndefined();
    });

    it('surfaces the permission service own reason when it gives one', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockTestDeveloperPermissions(false, 'Your role is Viewer in this org.');

        await expect(runGuards(mockContext, mockProject)).resolves.toEqual({
            error: 'Your role is Viewer in this org.',
        });
    });

    it('falls back to the generic reason when the service gives none', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockTestDeveloperPermissions(false);

        await expect(runGuards(mockContext, mockProject)).resolves.toEqual({
            error: 'Developer or System Admin role required for App Builder.',
        });
    });
});

describe('guardOrBlock', () => {
    it('reports the step, then answers undefined when the chain passes', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockTestDeveloperPermissions(true);
        const report = jest.fn();

        await expect(guardOrBlock(mockContext, mockProject, report)).resolves.toBeUndefined();
        expect(report).toHaveBeenCalledWith('Checking requirements…');
    });

    it('marks a refusal BLOCKED, so the caller skips the failed-op path', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });

        const refusal = await guardOrBlock(mockContext, mockProject, jest.fn());

        expect(refusal).toEqual({
            success: false,
            error: 'Adobe sign-in required.',
            code: ErrorCode.AUTH_REQUIRED,
            // Nothing ran and nothing persisted — an error row would be a lie.
            blocked: true,
        });
        expect(vscodeMock.window.showWarningMessage).toHaveBeenCalledWith('Adobe sign-in required.');
    });
});

describe('resolveAddEntry — one payload, two doors', () => {
    it('builds a custom entry from a source, carrying the typed name and instance id', () => {
        resolveAddEntry({
            source: { owner: 'acme', repo: 'erp-sync' },
            name: 'My ERP',
            instanceId: 'my-erp-2',
        });

        // Dropping either argument is how a named blank starter came back as its
        // owner-repo slug (2026-07-31).
        expect(mockBuildCustomIntegrationEntry).toHaveBeenCalledWith(
            { owner: 'acme', repo: 'erp-sync', name: 'My ERP' },
            'my-erp-2'
        );
    });

    it('prefers the source over an id when the payload carries both', () => {
        resolveAddEntry({ id: 'erp-sync', source: { owner: 'acme', repo: 'erp-sync' } });

        expect(mockBuildCustomIntegrationEntry).toHaveBeenCalled();
        expect(mockGetAppBuilderComponentEntry).not.toHaveBeenCalled();
    });

    it('falls through to the catalog when the source is missing its repo', () => {
        resolveAddEntry({
            id: 'erp-sync',
            source: { owner: 'acme' } as { owner: string; repo: string },
        });

        expect(mockBuildCustomIntegrationEntry).not.toHaveBeenCalled();
        expect(mockGetAppBuilderComponentEntry).toHaveBeenCalledWith('erp-sync');
    });

    it('resolves a catalog id through the loader', () => {
        expect(resolveAddEntry({ id: 'erp-sync' })).toEqual(ERP_ENTRY);
    });

    it('resolves nothing from an empty payload', () => {
        expect(resolveAddEntry({})).toBeUndefined();
        expect(mockGetAppBuilderComponentEntry).not.toHaveBeenCalled();
    });
});

describe('userSuppliedEnvVars — what a PERSON must type', () => {
    /** An entry with the given env schema; everything else is the ERP fixture. */
    function entryWithSchema(
        envSchema: AppBuilderComponentCatalogEntry['envSchema']
    ): AppBuilderComponentCatalogEntry {
        return { ...ERP_ENTRY, envSchema } as AppBuilderComponentCatalogEntry;
    }

    it('names nothing for an entry with no schema at all', () => {
        expect(userSuppliedEnvVars(ERP_ENTRY as AppBuilderComponentCatalogEntry)).toEqual({
            names: [],
            hasSecret: false,
        });
    });

    it('names the text vars and reports no secret', () => {
        expect(userSuppliedEnvVars(entryWithSchema([{ name: 'ERP_HOST', label: 'Host', type: 'text' }]))).toEqual(
            { names: ['ERP_HOST'], hasSecret: false }
        );
    });

    it('flags a secret var, which must never ride a tool argument', () => {
        const result = userSuppliedEnvVars(
            entryWithSchema([
                { name: 'ERP_HOST', label: 'Host', type: 'text' },
                { name: 'ERP_KEY', label: 'Key', type: 'secret' },
            ])
        );

        expect(result.names).toEqual(expect.arrayContaining(['ERP_HOST', 'ERP_KEY']));
        expect(result.hasSecret).toBe(true);
    });

    it('excludes an auto-wired var — naming it sends the user hunting', () => {
        expect(
            userSuppliedEnvVars(
                entryWithSchema([{ name: 'MESH_ENDPOINT', label: 'Mesh', type: 'text', providedBy: 'mesh' }])
            )
        ).toEqual({ names: [], hasSecret: false });
    });
});

describe('buildToolchainConsent — the human/agent split', () => {
    it('defers to the factory prompt when a panel is present', () => {
        const { mockContext } = setupMocks();

        expect(buildToolchainConsent(mockContext, true)).toBeUndefined();
    });

    it('answers YES headless when the request asked for the refresh', async () => {
        const { mockContext } = setupMocks();
        const consent = buildToolchainConsent({ ...mockContext, panel: undefined }, true);

        await expect(consent?.()).resolves.toBe(true);
    });

    it('answers NO headless when the request said false', async () => {
        const { mockContext } = setupMocks();
        const consent = buildToolchainConsent({ ...mockContext, panel: undefined }, false);

        await expect(consent?.()).resolves.toBe(false);
    });

    it('answers NO headless when the request said nothing — never park on a dialog', async () => {
        const { mockContext } = setupMocks();
        const consent = buildToolchainConsent({ ...mockContext, panel: undefined }, undefined);

        await expect(consent?.()).resolves.toBe(false);
    });

    it('reaches the deploy runner deps as the third argument, headless', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: {
                'erp-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'acme', repo: 'erp-sync' },
                },
            },
        });
        mockTestDeveloperPermissions(true);

        await handleDeployAppBuilderComponent(
            { ...mockContext, panel: undefined },
            { id: 'erp-sync', refreshCli: true }
        );

        const consent = (mockBuildDefaultRunnerDeps.mock.calls[0] as unknown[])[2] as () => Promise<boolean>;
        await expect(consent()).resolves.toBe(true);
    });
});

describe('the sub-step reporter handed to the runner', () => {
    /** The reporter the handler builds for the runner's deploy tail. */
    function reporterFromLastDepsCall(): (m: string, s?: string) => void {
        return (mockBuildDefaultRunnerDeps.mock.calls[0] as unknown[])[1] as (
            m: string,
            s?: string
        ) => void;
    }

    it('shows the SUB-step alone when the runner supplies one', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        const report = jest.fn();
        vscodeMock.window.withProgress.mockImplementation(
            async (_o: unknown, task: (p: { report: jest.Mock }) => Promise<unknown>) =>
                task({ report })
        );

        await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });
        reporterFromLastDepsCall()('Deploying custom integration…', 'Running aio app deploy');

        // Joining both produced two-line cards (owner screenshot, 2026-08-27).
        expect(report).toHaveBeenCalledWith({ message: 'Running aio app deploy' });
    });

    it('falls back to the top-level message when there is no sub-step', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        const report = jest.fn();
        vscodeMock.window.withProgress.mockImplementation(
            async (_o: unknown, task: (p: { report: jest.Mock }) => Promise<unknown>) =>
                task({ report })
        );

        await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });
        reporterFromLastDepsCall()('Cloning the repository…', undefined);

        expect(report).toHaveBeenCalledWith({ message: 'Cloning the repository…' });
    });
});

describe('resolveComponentTarget', () => {
    it('refuses a request with no id, without reading any project', async () => {
        const { mockContext } = setupMocks();

        await expect(resolveComponentTarget(mockContext, undefined)).resolves.toEqual({
            ok: false,
            error: {
                success: false,
                error: 'AppBuilderComponent id is required',
                code: ErrorCode.CONFIG_INVALID,
            },
        });
        expect(mockContext.stateManager.getCurrentProject).not.toHaveBeenCalled();
    });

    it('refuses an empty-string id the same way', async () => {
        const { mockContext } = setupMocks();

        const target = await resolveComponentTarget(mockContext, '');

        expect(target.ok).toBe(false);
    });

    it('refuses when there is no current project', async () => {
        const { mockContext } = setupMocks();
        (mockContext.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(undefined);

        await expect(resolveComponentTarget(mockContext, 'erp-sync')).resolves.toEqual({
            ok: false,
            error: {
                success: false,
                error: 'No project found',
                code: ErrorCode.PROJECT_NOT_FOUND,
            },
        });
    });

    it('answers with the id and the project when both are there', async () => {
        const { mockContext, mockProject } = setupMocks();

        await expect(resolveComponentTarget(mockContext, 'erp-sync')).resolves.toEqual({
            ok: true,
            id: 'erp-sync',
            project: mockProject,
        });
    });
});

describe('the four push channels', () => {
    it('posts a row status with its id, status, message and name', async () => {
        await postRowStatus('erp-sync', 'deploying', 'Cloning…', 'ERP Sync');

        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'erp-sync',
            'deploying',
            'Cloning…',
            'ERP Sync'
        );
    });

    it('posts mesh status on the MESH channel — a row push reaches nothing', async () => {
        await postMeshStatus('deploying', 'Building the mesh…');

        expect(mockSendMeshStatusUpdate).toHaveBeenCalledWith('deploying', 'Building the mesh…');
        expect(mockSendAppBuilderComponentStatusUpdate).not.toHaveBeenCalled();
    });

    it('posts the destination titles for the header crumb', async () => {
        await postDestination({ projectTitle: 'Acme', workspaceTitle: 'Stage' });

        expect(mockSendProjectDestinationUpdate).toHaveBeenCalledWith({
            projectTitle: 'Acme',
            workspaceTitle: 'Stage',
        });
    });

    it('posts the project persisted components map', async () => {
        const components = {
            'erp-sync': {
                kind: 'integration' as const,
                status: 'deployed' as const,
                source: { owner: 'acme', repo: 'erp-sync' },
            },
        };
        const { mockContext } = setupMocks({ appBuilderComponents: components });

        await postComponentsSnapshot(mockContext);

        expect(mockSendAppBuilderComponentsSnapshot).toHaveBeenCalledWith(components);
    });

    it('posts an EMPTY map — not undefined — for a project with no components', async () => {
        const { mockContext } = setupMocks({ appBuilderComponents: undefined });

        await postComponentsSnapshot(mockContext);

        expect(mockSendAppBuilderComponentsSnapshot).toHaveBeenCalledWith({});
    });

    it('posts nothing at all when there is no project', async () => {
        const { mockContext } = setupMocks();
        (mockContext.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(undefined);

        await postComponentsSnapshot(mockContext);

        expect(mockSendAppBuilderComponentsSnapshot).not.toHaveBeenCalled();
    });
});

describe('withComponentProgress', () => {
    it('telegraphs the card with the operation label and returns the run result', async () => {
        const logger = setupMocks().mockContext.logger;

        const result = await withComponentProgress(
            { title: 'Deploying', id: 'erp-sync', label: 'ERP Sync', noun: 'Integration', logger },
            async () => ({ success: true, marker: 'ran' })
        );

        expect(result).toEqual({ success: true, marker: 'ran' });
        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'erp-sync',
            'deploying',
            expect.any(String),
            undefined
        );
    });

    it('returns a blocked result unchanged, so the caller can tell it from a failure', async () => {
        const logger = setupMocks().mockContext.logger;

        await expect(
            withComponentProgress(
                { title: 'Adding', id: 'x', label: 'X', noun: 'Integration', logger },
                async () => ({ success: false, error: 'no auth', blocked: true })
            )
        ).resolves.toEqual({ success: false, error: 'no auth', blocked: true });
    });
});

describe('the no-project door on every handler', () => {
    it('add answers a coded failure', async () => {
        const { mockContext } = setupMocks();
        (mockContext.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(undefined);

        await expect(
            handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' })
        ).resolves.toEqual({
            success: false,
            error: 'No project found',
            code: ErrorCode.PROJECT_NOT_FOUND,
        });
    });

    it('deploy answers a coded failure', async () => {
        const { mockContext } = setupMocks();
        (mockContext.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(undefined);

        await expect(
            handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' })
        ).resolves.toEqual({
            success: false,
            error: 'No project found',
            code: ErrorCode.PROJECT_NOT_FOUND,
        });
    });

    it('remove answers a coded failure', async () => {
        const { mockContext } = setupMocks();
        (mockContext.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(undefined);

        await expect(
            handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' })
        ).resolves.toEqual({
            success: false,
            error: 'No project found',
            code: ErrorCode.PROJECT_NOT_FOUND,
        });
    });

    it('rename answers a coded failure', async () => {
        const { mockContext } = setupMocks();
        (mockContext.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(undefined);

        await expect(
            handleRenameAppBuilderComponent(mockContext, { id: 'erp-sync' })
        ).resolves.toEqual({
            success: false,
            error: 'No project found',
            code: ErrorCode.PROJECT_NOT_FOUND,
        });
    });
});
