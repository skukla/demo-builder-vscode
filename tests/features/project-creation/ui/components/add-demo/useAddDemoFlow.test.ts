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
