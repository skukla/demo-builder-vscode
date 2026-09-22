/**
 * appBuilderComponentHandlers — the refusals and the fallbacks.
 *
 * Split from the main handler suite for size; this one holds the paths a project
 * only reaches when something is missing or already there. One of them is a gate
 * against a silent overwrite and is worth stating plainly:
 *
 *   the same-id gate      an id is simultaneously the map slot, the clone folder
 *                         and the OpenWhisk package, so a second add REPLACES the
 *                         first on Runtime rather than sitting beside it
 *
 * A same-SOURCE gate stood beside it (extension-layout apps ship fixed package
 * names, so two copies in ONE workspace collide) until every add got a workspace
 * of its own (AB-23), which removed the collision it guarded.
 *
 * The rest are fallbacks: a project with no selections, an entry with no name, a
 * runner failure with no message. Each is asserted on what a collaborator is
 * HANDED, because every one of them produces a plausible-looking result either way.
 */

import {
    ERP_ENTRY,
    handleAddAppBuilderComponent,
    handleDeployAppBuilderComponent,
    handleRemoveAppBuilderComponent,
    handleRenameAppBuilderComponent,
    mockAddAppBuilderComponent,
    mockBuildDefaultRunnerDeps,
    mockBuildRunnerDepsContext,
    mockDeployAppBuilderComponent,
    mockEnsureAdobeIOAuth,
    mockGetAppBuilderComponentEntry,
    mockRemoveAppBuilderComponent,
    mockSendAppBuilderComponentStatusUpdate,
    mockTestDeveloperPermissions,
    resetHandlerMocks,
    setupMocks,
    vscodeMock,
} from './appBuilderComponentHandlers.testUtils';
import type { AppBuilderComponentState } from '@/types/base';

beforeEach(() => {
    resetHandlerMocks();
});

/** A deployed component, as the keyed map stores it. */
function deployed(owner: string, repo: string, name?: string): AppBuilderComponentState {
    return {
        kind: 'integration',
        status: 'deployed',
        source: { owner, repo },
        ...(name ? { name } : {}),
    } as AppBuilderComponentState;
}

describe('the stack gate on the add-by-id door', () => {
    it('treats a project with NO selections as unconstrained, not as a crash', async () => {
        const { mockContext } = setupMocks({ componentSelections: undefined });
        mockTestDeveloperPermissions(true);

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
    });

    it('accepts an entry constrained to the project OWN frontend', async () => {
        const { mockContext } = setupMocks({
            componentSelections: { backend: 'adobe-commerce-paas', frontend: 'eds-storefront' },
        });
        mockTestDeveloperPermissions(true);
        mockGetAppBuilderComponentEntry.mockReturnValue({
            ...ERP_ENTRY,
            compatibleFrontends: ['eds-storefront'],
        });

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        // The frontend id has to REACH the axis filter. Losing it here refuses
        // every frontend-constrained entry on the project it was built for.
        expect(result.success).toBe(true);
    });

    it('names the entry by its display NAME when it refuses, not by its slug', async () => {
        const { mockContext } = setupMocks({
            componentSelections: { backend: 'adobe-commerce-paas', frontend: 'eds-storefront' },
        });
        mockTestDeveloperPermissions(true);
        mockGetAppBuilderComponentEntry.mockReturnValue({
            ...ERP_ENTRY,
            compatibleBackends: ['adobe-commerce-accs'],
        });

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(result.error).toContain('"ERP Sync"');
        expect(result.error).toContain('adobe-commerce-accs');
    });

    it('refuses a FRONTEND-constrained entry without listing backends it never named', async () => {
        const { mockContext } = setupMocks({
            componentSelections: { backend: 'adobe-commerce-paas', frontend: 'headless' },
        });
        mockTestDeveloperPermissions(true);
        mockGetAppBuilderComponentEntry.mockReturnValue({
            ...ERP_ENTRY,
            compatibleFrontends: ['eds-storefront'],
        });

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(result.error).toContain("isn't compatible with this project's stack.");
        expect(result.error).not.toContain('requires one of these backends');
    });
});

describe('the same-id gate', () => {
    it('adds when the project holds no components at all', async () => {
        const { mockContext } = setupMocks({ appBuilderComponents: undefined });
        mockTestDeveloperPermissions(true);

        await expect(
            handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' })
        ).resolves.toMatchObject({ success: true });
    });

    it('names the EXISTING entry by its display name when it refuses', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: { 'erp-sync': deployed('acme', 'erp-sync') },
        });
        mockTestDeveloperPermissions(true);

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.error).toContain('"ERP Sync"');
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });
});

describe('an entry that needs values before it can deploy', () => {
    const NEEDS_INPUT = {
        ...ERP_ENTRY,
        envSchema: [{ name: 'ERP_API_KEY', type: 'secret', label: 'ERP API Key' }],
    };

    it('pushes NO row status at all — nothing was attempted', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockGetAppBuilderComponentEntry.mockReturnValue(NEEDS_INPUT);

        await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        // The real call shape: the fourth slot is undefined on every deploy-path
        // push, so an assertion using expect.anything() there matches nothing and
        // passes whatever happened.
        expect(mockSendAppBuilderComponentStatusUpdate).not.toHaveBeenCalledWith(
            'erp-sync',
            'error',
            expect.any(String),
            undefined
        );
    });
});

describe('the API picks attributed to the new component', () => {
    it('MERGES the picks beside those of the components already there', async () => {
        const { mockContext, mockProject } = setupMocks({
            componentApiPicks: { 'other-app': ['AdobeAnalytics'] },
        });
        mockTestDeveloperPermissions(true);

        await handleAddAppBuilderComponent(mockContext, {
            id: 'erp-sync',
            apis: ['AdobeCommerce'],
        });

        // Replacing the map instead of merging silently unsubscribes every other
        // component at the next reconcile.
        expect(mockProject.componentApiPicks).toEqual({
            'other-app': ['AdobeAnalytics'],
            'erp-sync': ['AdobeCommerce'],
        });
        expect(mockContext.stateManager.saveProject).toHaveBeenCalledWith(mockProject);
    });

    it('de-duplicates the picks it attributes', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockTestDeveloperPermissions(true);

        await handleAddAppBuilderComponent(mockContext, {
            id: 'erp-sync',
            apis: ['AdobeCommerce', 'AdobeCommerce'],
        });

        expect(mockProject.componentApiPicks?.['erp-sync']).toEqual(['AdobeCommerce']);
    });

    it('saves nothing when the add carries no picks', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);

        await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockContext.stateManager.saveProject).not.toHaveBeenCalled();
    });
});

describe('the deploy path', () => {
    const DEPLOYED = { 'erp-sync': deployed('acme', 'erp-sync', 'ERP Sync') };

    it('hands the shared services to the deps context', async () => {
        const { mockContext, mockProject } = setupMocks({ appBuilderComponents: DEPLOYED });
        mockTestDeveloperPermissions(true);

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockBuildRunnerDepsContext).toHaveBeenCalledWith(
            mockContext,
            mockProject,
            expect.objectContaining({
                authManager: expect.anything(),
                commandManager: expect.anything(),
            })
        );
    });

    it('telegraphs the row it is deploying, by id', async () => {
        const { mockContext } = setupMocks({ appBuilderComponents: DEPLOYED });
        mockTestDeveloperPermissions(true);

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'erp-sync',
            'deploying',
            expect.any(String),
            undefined
        );
    });

    // PL-59 phase 2 (owner, 2026-09-19): a notification shows the STAGE, the short
    // set; the step is the modal's long set. It replaced "the sub-step alone" (2026-08-27).
    it('shows the stage name in the notification, not the step', async () => {
        const { mockContext } = setupMocks({ appBuilderComponents: DEPLOYED });
        mockTestDeveloperPermissions(true);
        const report = jest.fn();
        vscodeMock.window.withProgress.mockImplementation(
            async (_o: unknown, task: (p: { report: jest.Mock }) => Promise<unknown>) =>
                task({ report })
        );

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });
        const reporter = (mockBuildDefaultRunnerDeps.mock.calls[0] as unknown[])[1] as (
            m: string,
            s?: string
        ) => void;
        reporter('Deploying custom integration…', 'Running aio app deploy');

        expect(report).toHaveBeenCalledWith({ message: 'Deploying custom integration…' });
    });

    it('falls back to the top-level message when the runner supplies no sub-step', async () => {
        const { mockContext } = setupMocks({ appBuilderComponents: DEPLOYED });
        mockTestDeveloperPermissions(true);
        const report = jest.fn();
        vscodeMock.window.withProgress.mockImplementation(
            async (_o: unknown, task: (p: { report: jest.Mock }) => Promise<unknown>) =>
                task({ report })
        );

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });
        const reporter = (mockBuildDefaultRunnerDeps.mock.calls[0] as unknown[])[1] as (
            m: string,
            s?: string
        ) => void;
        reporter('Installing dependencies…', undefined);

        expect(report).toHaveBeenCalledWith({ message: 'Installing dependencies…' });
    });

    it('posts the runner OWN error on the row when the deploy fails', async () => {
        const { mockContext } = setupMocks({ appBuilderComponents: DEPLOYED });
        mockTestDeveloperPermissions(true);
        mockDeployAppBuilderComponent.mockResolvedValue({
            success: false,
            error: 'aio app deploy exited 1',
        });

        const result = await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result).toEqual({ success: false, error: 'aio app deploy exited 1' });
        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'erp-sync',
            'error',
            'aio app deploy exited 1',
            undefined
        );
    });

    it('posts a generic reason when the runner fails without one', async () => {
        const { mockContext } = setupMocks({ appBuilderComponents: DEPLOYED });
        mockTestDeveloperPermissions(true);
        mockDeployAppBuilderComponent.mockResolvedValue({ success: false });

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'erp-sync',
            'error',
            'Deployment failed',
            undefined
        );
    });

    it('clears the row message on success rather than leaving the last step on it', async () => {
        const { mockContext } = setupMocks({ appBuilderComponents: DEPLOYED });
        mockTestDeveloperPermissions(true);

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenLastCalledWith(
            'erp-sync',
            'deployed',
            undefined,
            undefined
        );
    });

    it('refuses a call with no payload at all', async () => {
        const { mockContext } = setupMocks();

        await expect(handleDeployAppBuilderComponent(mockContext, undefined)).resolves.toEqual({
            success: false,
            error: 'AppBuilderComponent id is required',
            code: expect.any(String),
        });
    });
});

describe('the remove path', () => {
    const DEPLOYED = { 'erp-sync': deployed('acme', 'erp-sync', 'ERP Sync') };

    it('titles the notification with the display NAME, not the id', async () => {
        const { mockContext } = setupMocks({ appBuilderComponents: DEPLOYED });
        mockTestDeveloperPermissions(true);

        await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(vscodeMock.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Removing ERP Sync' }),
            expect.any(Function)
        );
    });

    it('falls back to the id for a component that was never named', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: { 'erp-sync': deployed('acme', 'erp-sync') },
        });
        mockTestDeveloperPermissions(true);

        await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(vscodeMock.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Removing erp-sync' }),
            expect.any(Function)
        );
    });

    it('hands the shared services to the deps context', async () => {
        const { mockContext, mockProject } = setupMocks({ appBuilderComponents: DEPLOYED });
        mockTestDeveloperPermissions(true);

        await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockBuildRunnerDepsContext).toHaveBeenCalledWith(
            mockContext,
            mockProject,
            expect.objectContaining({
                authManager: expect.anything(),
                commandManager: expect.anything(),
            })
        );
    });

    it('telegraphs the row it is removing, by id', async () => {
        const { mockContext } = setupMocks({ appBuilderComponents: DEPLOYED });
        mockTestDeveloperPermissions(true);

        await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'erp-sync',
            'deploying',
            expect.any(String),
            undefined
        );
    });

    it('stops at a failing guard and never undeploys', async () => {
        const { mockContext } = setupMocks({ appBuilderComponents: DEPLOYED });
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });

        const result = await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result).toEqual({ success: false, error: 'Adobe sign-in required.' });
        expect(mockRemoveAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('refuses a call with no payload at all', async () => {
        const { mockContext } = setupMocks();

        await expect(handleRemoveAppBuilderComponent(mockContext, undefined)).resolves.toEqual({
            success: false,
            error: 'AppBuilderComponent id is required',
            code: expect.any(String),
        });
    });
});

describe('the rename collision domain', () => {
    /** A custom (non-catalog) integration, so rename is allowed at all. */
    function customProject(components: Record<string, AppBuilderComponentState>) {
        const mocks = setupMocks({ appBuilderComponents: components });
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);
        return mocks;
    }

    it('collides with a taken name regardless of its surrounding whitespace', async () => {
        const { mockContext } = customProject({
            mine: deployed('acme', 'mine', 'Mine'),
            other: deployed('acme', 'other', '  Shipping  '),
        });

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'mine',
            name: 'Shipping',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('That name is already used by another integration.');
    });

    it('does NOT collide with a MESH entry that happens to share the name', async () => {
        const { mockContext } = customProject({
            mine: deployed('acme', 'mine', 'Mine'),
            mesh: {
                kind: 'mesh',
                status: 'deployed',
                source: { owner: '', repo: '' },
                name: 'Shipping',
            } as AppBuilderComponentState,
        });

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'mine',
            name: 'Shipping',
        });

        expect(result).toMatchObject({ success: true, renamed: { id: 'mine', name: 'Shipping' } });
    });

    it('refuses a call with no payload at all', async () => {
        const { mockContext } = setupMocks();

        await expect(handleRenameAppBuilderComponent(mockContext, undefined)).resolves.toEqual({
            success: false,
            error: 'AppBuilderComponent id is required',
            code: expect.any(String),
        });
    });
});
