/**
 * The dialog's state machine: the two commitment points are the only host calls.
 */

import { act, renderHook } from '@testing-library/react';
import { useAddDemoFlow } from '@/features/project-creation/ui/components/add-demo/useAddDemoFlow';
import type { SharedDemoRead } from '@/types/webviewRequests';
import { makeDemoPackage } from '../../../../../helpers/demoPackageFixtures';

const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: { request: (...args: unknown[]) => mockRequest(...args) },
}));

const READ: SharedDemoRead = {
    outcome: 'read',
    fullName: 'jen/isle5-demo',
    defaultBranch: 'main',
    isTemplate: false,
    kind: 'eds',
    contentPublished: { indexFound: false },
    b2b: 'on',
    b2bSource: 'dependencies',
    overrides: [],
    warnings: [],
};

function setup() {
    const onUseShipped = jest.fn();
    const onDemoAdded = jest.fn();
    const onClose = jest.fn();
    const hook = renderHook(() =>
        useAddDemoFlow({
            packages: [makeDemoPackage({ id: 'starter', name: 'Starter (B2B + B2C)' })],
            onUseShipped,
            onDemoAdded,
            onClose,
        }),
    );
    return { hook, onUseShipped, onDemoAdded, onClose };
}

async function walkToFound(hook: ReturnType<typeof setup>['hook'], answer: unknown): Promise<void> {
    mockRequest.mockResolvedValueOnce(answer);
    act(() => hook.result.current.setSource({ owner: 'jen', repo: 'isle5-demo' }));
    await act(async () => {
        hook.result.current.onContinue();
    });
}

describe('useAddDemoFlow', () => {
    beforeEach(() => jest.clearAllMocks());

    it('starts on the link stage with Continue disabled until a source is set, and never calls the host for typing', () => {
        const { hook } = setup();
        expect(hook.result.current.stage).toBe('link');
        expect(hook.result.current.canContinue).toBe(false);
        act(() => hook.result.current.setSource({ owner: 'jen', repo: 'isle5-demo' }));
        expect(hook.result.current.canContinue).toBe(true);
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('probes on Continue and lands on the found stage with the answer', async () => {
        const { hook } = setup();
        await walkToFound(hook, { success: true, result: READ });

        expect(mockRequest).toHaveBeenCalledWith('probe-shared-demo', { owner: 'jen', repo: 'isle5-demo' });
        expect(hook.result.current.stage).toBe('found');
        expect(hook.result.current.probe).toEqual({ status: 'done', result: READ });
        expect(hook.result.current.continueLabel).toBe('Add demo');
        expect(hook.result.current.canContinue).toBe(true);
    });

    it('carries the sign-in handoff on a failed probe, so the stage can say what to do', async () => {
        const { hook } = setup();
        await walkToFound(hook, { success: false, error: 'Sign in to GitHub to read this demo.', needsAuth: 'github' });
        expect(hook.result.current.probe).toEqual({
            status: 'failed',
            error: 'Sign in to GitHub to read this demo.',
            needsAuth: true,
        });
    });

    it('turns a refused probe into a failed state the stage shows, with Continue disabled', async () => {
        const { hook } = setup();
        await walkToFound(hook, { success: false, error: 'owner and repo are required' });
        expect(hook.result.current.probe).toEqual({ status: 'failed', error: 'owner and repo are required' });
        expect(hook.result.current.canContinue).toBe(false);
    });

    it('imports a zip through the host, then probes the repository it created, with the visibility the tick box says', async () => {
        const { hook } = setup();
        mockRequest.mockResolvedValueOnce({ success: true, result: { owner: 'steve', repo: 'summit', fullName: 'steve/summit', fileCount: 3, dropped: 1, isPrivate: false } });
        mockRequest.mockResolvedValueOnce({ success: true, result: READ });

        act(() => hook.result.current.setMakePublic(true));
        await act(async () => hook.result.current.importZip());

        expect(mockRequest).toHaveBeenNthCalledWith(1, 'import-storefront-zip', { isPrivate: false });
        expect(mockRequest).toHaveBeenNthCalledWith(2, 'probe-shared-demo', { owner: 'steve', repo: 'summit' });
        expect(hook.result.current.stage).toBe('found');
        expect(hook.result.current.draft.source).toEqual({ owner: 'steve', repo: 'summit' });
        expect(hook.result.current.importing).toBe(false);
    });

    it("keeps a bundle's setup, and Start a project adds the demo then hands setup and row to the host", async () => {
        const { hook, onDemoAdded } = setup();
        const SETUP = { version: 1, exportedAt: 'x', source: {}, includesSecrets: false, selections: {}, configs: {} };
        mockRequest.mockResolvedValueOnce({ success: true, result: { owner: 'steve', repo: 'summit', setup: SETUP } });
        mockRequest.mockResolvedValueOnce({ success: true, result: { ...READ, fullName: 'steve/summit', viewer: { login: 'steve', ownsRepo: true } } });
        await act(async () => hook.result.current.importZip());
        expect(hook.result.current.bundleSetup).toEqual(SETUP);

        const remembered = { kind: 'demo', version: 1, name: 'Summit', source: { owner: 'steve', repo: 'summit', branch: 'main' }, storefrontKind: 'eds' };
        mockRequest.mockResolvedValueOnce({ success: true, result: { demo: remembered } });
        mockRequest.mockResolvedValueOnce({ success: true });
        await act(async () => hook.result.current.startFromBundle());

        expect(mockRequest).toHaveBeenNthCalledWith(3, 'add-shared-demo', expect.objectContaining({ keepCopy: false }));
        expect(mockRequest).toHaveBeenNthCalledWith(4, 'use-bundle-setup', { setup: SETUP, demo: remembered });
        expect(onDemoAdded).toHaveBeenCalledWith(remembered);
    });

    it('stays on the link stage when the picker is dismissed, and shows the refusal when the zip is not a storefront', async () => {
        const { hook } = setup();
        mockRequest.mockResolvedValueOnce({ success: true, result: { cancelled: true } });
        await act(async () => hook.result.current.importZip());
        expect(hook.result.current.stage).toBe('link');
        expect(hook.result.current.zipError).toBeUndefined();

        mockRequest.mockResolvedValueOnce({ success: false, error: 'This zip is not an Edge Delivery storefront: it has no head.html.' });
        await act(async () => hook.result.current.importZip());
        expect(hook.result.current.stage).toBe('link');
        expect(hook.result.current.zipError).toBe('This zip is not an Edge Delivery storefront: it has no head.html.');
        expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('commits through add-shared-demo with the row and the copy choice, then reports and closes', async () => {
        const { hook, onDemoAdded, onClose } = setup();
        await walkToFound(hook, { success: true, result: READ });
        const remembered = { kind: 'demo', name: 'Isle5 Demo', source: { owner: 'steve', repo: 'isle5-demo' } };
        mockRequest.mockResolvedValueOnce({ success: true, result: { demo: remembered, forkedTo: 'steve/isle5-demo' } });

        await act(async () => {
            hook.result.current.onContinue();
        });

        expect(mockRequest).toHaveBeenLastCalledWith('add-shared-demo', {
            demo: expect.objectContaining({ name: 'Isle5 Demo', source: { owner: 'jen', repo: 'isle5-demo', branch: 'main' } }),
            keepCopy: true,
        });
        expect(onDemoAdded).toHaveBeenCalledWith(remembered);
        expect(onClose).toHaveBeenCalled();
    });

    it("asks for no copy of the SC's own repository, whatever the box says", async () => {
        const { hook } = setup();
        await walkToFound(hook, { success: true, result: { ...READ, viewer: { login: 'jen', ownsRepo: true } } });
        mockRequest.mockResolvedValueOnce({ success: true, result: { demo: {} } });
        await act(async () => {
            hook.result.current.onContinue();
        });
        expect(mockRequest).toHaveBeenLastCalledWith('add-shared-demo', expect.objectContaining({ keepCopy: false }));
    });

    it('keeps the dialog open with the error when the add is refused', async () => {
        const { hook, onClose } = setup();
        await walkToFound(hook, { success: true, result: READ });
        mockRequest.mockResolvedValueOnce({ success: false, error: "We couldn't make your own copy of this demo." });
        await act(async () => {
            hook.result.current.onContinue();
        });
        expect(hook.result.current.addError).toMatch(/own copy/);
        expect(hook.result.current.adding).toBe(false);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('selects the shipped card and closes when the link is one of our templates', async () => {
        const { hook, onUseShipped, onClose } = setup();
        await walkToFound(hook, {
            success: true,
            result: { outcome: 'shipped', shippedPackageId: 'starter', fullName: 'adobe-commerce/boilerplate-b2b-template' },
        });
        expect(hook.result.current.continueLabel).toBe('Use Starter (B2B + B2C)');
        act(() => hook.result.current.onContinue());
        expect(onUseShipped).toHaveBeenCalledWith('starter');
        expect(onClose).toHaveBeenCalled();
        expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('goes back to the link stage and forgets the probe', async () => {
        const { hook } = setup();
        await walkToFound(hook, { success: true, result: READ });
        act(() => hook.result.current.onBack());
        expect(hook.result.current.stage).toBe('link');
        expect(hook.result.current.probe).toEqual({ status: 'idle' });
        expect(hook.result.current.draft.source).toEqual({ owner: 'jen', repo: 'isle5-demo' });
    });
});
