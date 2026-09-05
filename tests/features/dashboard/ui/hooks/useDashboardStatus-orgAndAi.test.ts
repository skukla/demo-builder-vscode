/**
 * useDashboardStatus — the org-context badge and the AI regenerate cycle.
 *
 * The "IMS Org" badge has a lifecycle, not a value. It telegraphs "Checking…"
 * until BOTH the async check has answered AND a minimum display time has passed,
 * so a warm-cache check does not flash the indicator and make the mismatch
 * banner appear out of nowhere. Every state below is asserted on the badge the
 * SC actually sees, because "checked" and "checked and visible for long enough"
 * produce identical internal state and different screens.
 *
 * The regenerate cycle is the other half: it is the only action this hook owns,
 * it takes up to a minute, and every one of its failure routes used to return
 * silently to idle with nothing on screen.
 */

import { renderHook, act } from '@testing-library/react';
import { StrictMode } from 'react';
import { setupMocks, type TestMocks } from './useDashboardStatus.testUtils';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { useDashboardStatus } from '@/features/dashboard/ui/hooks/useDashboardStatus';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn(),
        request: jest.fn(),
    },
}));

let mocks: TestMocks;

beforeEach(() => {
    mocks = setupMocks();
});

/** Render with an Adobe-backed project (the only one that shows the badge). */
function renderWithOrg(hasAdobeContext = true) {
    return renderHook(() => useDashboardStatus({ hasAdobeContext }));
}

/** Let the minimum-display timer expire. */
function elapseMinDisplay(): void {
    act(() => {
        jest.advanceTimersByTime(FRONTEND_TIMEOUTS.ORG_CHECK_MIN_DISPLAY);
    });
}

/** Deliver an org-context outcome through the on-open check channel. */
function deliverOrgCheck(status: string, data?: Record<string, unknown>): void {
    act(() => {
        mocks.state.orgHandler?.({ checkId: 'org-context', status, data });
    });
}

describe('the IMS Org badge lifecycle', () => {
    it('shows no badge at all for a project with no Adobe org', () => {
        const { result } = renderWithOrg(false);

        expect(result.current.orgCheckState).toBe('none');
        expect(result.current.imsOrgDisplay).toBeNull();
    });

    it('starts on Checking… before the check has answered', () => {
        const { result } = renderWithOrg();

        expect(result.current.orgCheckState).toBe('checking');
        expect(result.current.imsOrgDisplay).toEqual({ color: 'blue', text: 'Checking…' });
    });

    it('STAYS on Checking… when the answer beats the minimum display time', () => {
        const { result } = renderWithOrg();

        deliverOrgCheck('ok', { currentOrg: 'Acme' });

        // A warm-cache check answers in milliseconds; resolving the badge here
        // makes the banner appear with no visible check in front of it.
        expect(result.current.orgCheckState).toBe('checking');
    });

    it('STAYS on Checking… when the time elapses before the answer', () => {
        const { result } = renderWithOrg();

        elapseMinDisplay();

        expect(result.current.orgCheckState).toBe('checking');
    });

    it('resolves only once BOTH the answer and the time have arrived', () => {
        const { result } = renderWithOrg();

        deliverOrgCheck('ok', { currentOrg: 'Acme' });
        elapseMinDisplay();

        expect(result.current.orgCheckState).toBe('ok');
        expect(result.current.imsOrgDisplay).toEqual({ color: 'green', text: 'Acme' });
    });

    it('names the org it reached, or says Connected when it has no name', () => {
        const { result } = renderWithOrg();

        deliverOrgCheck('ok', {});
        elapseMinDisplay();

        expect(result.current.imsOrgDisplay).toEqual({ color: 'green', text: 'Connected' });
    });

    it('goes red and names the WRONG org on a mismatch', () => {
        const { result } = renderWithOrg();

        deliverOrgCheck('warning', {
            currentOrg: 'Other Org',
            orgMismatch: { projectOrg: 'Acme', currentOrg: 'Other Org' },
        });
        elapseMinDisplay();

        expect(result.current.orgCheckState).toBe('mismatch');
        expect(result.current.imsOrgDisplay).toEqual({ color: 'red', text: 'Other Org' });
        expect(result.current.orgMismatch).toEqual({
            projectOrg: 'Acme',
            currentOrg: 'Other Org',
        });
    });

    it('falls back to "Wrong org" on a mismatch with no name to show', () => {
        const { result } = renderWithOrg();

        deliverOrgCheck('warning', {});
        elapseMinDisplay();

        expect(result.current.imsOrgDisplay).toEqual({ color: 'red', text: 'Wrong org' });
    });

    it('degrades an UNKNOWN outcome to the quiet sign-in affordance', () => {
        const { result } = renderWithOrg();

        deliverOrgCheck('unknown');
        elapseMinDisplay();

        expect(result.current.orgCheckState).toBe('unknown');
        expect(result.current.imsOrgDisplay).toEqual({ color: 'gray', text: 'Not checked' });
    });

    it('degrades an ERROR outcome the same way — never a red badge', () => {
        const { result } = renderWithOrg();

        deliverOrgCheck('error');
        elapseMinDisplay();

        // An unexpected error is not evidence of a mismatch; showing red would
        // accuse a project that may be perfectly fine.
        expect(result.current.orgCheckState).toBe('unknown');
        expect(result.current.imsOrgDisplay).toEqual({ color: 'gray', text: 'Not checked' });
    });

    it('re-renders the badge as the org state moves, rather than freezing the first value', () => {
        const { result } = renderWithOrg();
        expect(result.current.imsOrgDisplay).toEqual({ color: 'blue', text: 'Checking…' });

        deliverOrgCheck('ok', { currentOrg: 'Acme' });
        elapseMinDisplay();

        expect(result.current.imsOrgDisplay).toEqual({ color: 'green', text: 'Acme' });
    });

    it('starts NO minimum-display timer for a project with no Adobe org', () => {
        const { result } = renderWithOrg(false);

        elapseMinDisplay();

        expect(result.current.orgCheckState).toBe('none');
    });

    it('starts the timer when a project GAINS an Adobe org', () => {
        const { result, rerender } = renderHook(
            ({ hasAdobeContext }) => useDashboardStatus({ hasAdobeContext }),
            { initialProps: { hasAdobeContext: false } }
        );

        rerender({ hasAdobeContext: true });
        deliverOrgCheck('ok', { currentOrg: 'Acme' });
        elapseMinDisplay();

        // The effect has to re-run on the prop, or the badge sits on Checking…
        // forever for a project that acquired its org after mount.
        expect(result.current.orgCheckState).toBe('ok');
    });
});

describe('the status subscription', () => {
    it('requests the status ONCE even when React double-invokes the effect', () => {
        renderHook(() => useDashboardStatus(), { wrapper: StrictMode });

        // StrictMode mounts, unmounts and mounts again in development. The ref
        // outlives that cycle; without it the dashboard asks twice on every open.
        expect(mocks.mockPostMessage).toHaveBeenCalledTimes(1);
        expect(mocks.mockPostMessage).toHaveBeenCalledWith('requestStatus');
    });

    it('lets a COMPLETED mesh status through while a deploy was in flight', () => {
        const { result } = renderHook(() => useDashboardStatus({ hasMesh: true }));

        act(() => {
            mocks.state.statusHandler?.({ status: 'ready', mesh: { status: 'deploying' } });
        });
        act(() => {
            mocks.state.statusHandler?.({ status: 'ready', mesh: { status: 'deployed' } });
        });

        // Only a transient 'checking' is suppressed mid-deploy; a terminal status
        // must land or the button never comes back.
        expect(result.current.meshStatus).toBe('deployed');
    });

    it('suppresses a transient checking status while a deploy is in flight', () => {
        const { result } = renderHook(() => useDashboardStatus({ hasMesh: true }));

        act(() => {
            mocks.state.statusHandler?.({ status: 'ready', mesh: { status: 'deploying' } });
        });
        act(() => {
            mocks.state.statusHandler?.({ status: 'ready', mesh: { status: 'checking' } });
        });

        expect(result.current.meshStatus).toBe('deploying');
    });

    it('survives a status update that carries no mesh block at all', () => {
        const { result } = renderHook(() => useDashboardStatus({ hasMesh: true }));

        act(() => {
            mocks.state.statusHandler?.({ status: 'ready', mesh: { status: 'deploying' } });
        });
        act(() => {
            mocks.state.statusHandler?.({ status: 'ready' });
        });

        expect(result.current.meshStatus).toBeUndefined();
    });

    it('survives a mesh update arriving after a status update that had none', () => {
        const { result } = renderHook(() => useDashboardStatus({ hasMesh: true }));

        act(() => {
            mocks.state.statusHandler?.({ status: 'ready' });
        });
        act(() => {
            mocks.state.statusHandler?.({ status: 'ready', mesh: { status: 'checking' } });
        });

        expect(result.current.meshStatus).toBe('checking');
    });
});

describe('clearing the transitioning flag', () => {
    /** Put the hook into the transitioning state a button click produces. */
    function transitioning() {
        const rendered = renderHook(() => useDashboardStatus());
        act(() => rendered.result.current.setIsTransitioning(true));
        return rendered;
    }

    it.each(['running', 'ready', 'stopped'])(
        'clears it on a definitive %s status',
        (status) => {
            const { result } = transitioning();

            act(() => {
                mocks.state.statusHandler?.({ status });
            });

            expect(result.current.isTransitioning).toBe(false);
        }
    );

    it.each(['starting', 'stopping', 'configuring'])(
        'KEEPS it during the transient %s status',
        (status) => {
            const { result } = transitioning();

            act(() => {
                mocks.state.statusHandler?.({ status });
            });

            // The button must stay disabled while the demo is mid-move.
            expect(result.current.isTransitioning).toBe(true);
        }
    );

    it('clears it when a mesh operation finishes', () => {
        const { result } = transitioning();

        act(() => {
            mocks.state.meshStatusHandler?.({ status: 'deployed' });
        });

        expect(result.current.isTransitioning).toBe(false);
    });

    it('KEEPS it while the mesh is still busy', () => {
        const { result } = transitioning();

        act(() => {
            mocks.state.meshStatusHandler?.({ status: 'deploying' });
        });

        expect(result.current.isTransitioning).toBe(true);
    });
});

describe('the AI regenerate cycle', () => {
    /** Run regenerateAiFiles to completion. */
    async function regenerate(result: {
        current: { regenerateAiFiles: () => Promise<void> };
    }): Promise<void> {
        await act(async () => {
            await result.current.regenerateAiFiles();
        });
    }

    it('reports the handler own error when the regenerate fails', async () => {
        mocks.mockRequest.mockResolvedValue({
            success: false,
            error: 'npm install failed in the project',
        });
        const { result } = renderWithOrg();

        await regenerate(result);

        // Discarding it left the modal returning to idle with no signal.
        expect(result.current.aiRegenError).toBe('npm install failed in the project');
    });

    it('reports a generic message when the failure carries none', async () => {
        mocks.mockRequest.mockResolvedValue({ success: false });
        const { result } = renderWithOrg();

        await regenerate(result);

        expect(result.current.aiRegenError).toBe('Regenerating AI files failed.');
    });

    it('reports a REJECTED request instead of returning silently to idle', async () => {
        mocks.mockRequest.mockRejectedValue(new Error('the extension host went away'));
        const { result } = renderWithOrg();

        await regenerate(result);

        expect(result.current.aiRegenError).toBe('the extension host went away');
    });

    it('reports the generic message when the rejection is not an Error', async () => {
        mocks.mockRequest.mockRejectedValue('a string nobody typed');
        const { result } = renderWithOrg();

        await regenerate(result);

        expect(result.current.aiRegenError).toBe('Regenerating AI files failed.');
    });

    it('clears a previous error on the next successful regenerate', async () => {
        mocks.mockRequest.mockResolvedValue({ success: false, error: 'first failure' });
        const { result } = renderWithOrg();
        await regenerate(result);
        expect(result.current.aiRegenError).toBe('first failure');

        mocks.mockRequest.mockResolvedValue({ success: true });
        await regenerate(result);

        expect(result.current.aiRegenError).toBeNull();
    });

    it('treats a response with no success field as a success', async () => {
        mocks.mockRequest.mockResolvedValue({});
        const { result } = renderWithOrg();

        await regenerate(result);

        expect(result.current.aiRegenError).toBeNull();
    });

    it('leaves busy and progress cleared however the regenerate ended', async () => {
        mocks.mockRequest.mockRejectedValue(new Error('boom'));
        const { result } = renderWithOrg();

        await regenerate(result);

        expect(result.current.aiBusy).toBe(false);
        expect(result.current.aiRegenProgress).toBeNull();
    });

    it('re-verifies after a regenerate so the badge reflects the new files', async () => {
        mocks.mockRequest.mockResolvedValue({ success: true });
        const { result } = renderWithOrg();

        await regenerate(result);

        expect(mocks.mockRequest).toHaveBeenCalledWith('regenerate-ai-files', {});
        expect(mocks.mockRequest).toHaveBeenCalledWith('verify-ai-setup', {});
    });

    it('marks the badge busy while the regenerate is in flight', async () => {
        // Only the FIRST call is deferred: the follow-up verify must still settle,
        // or awaiting the regenerate never returns.
        let release: (value: unknown) => void = () => {};
        mocks.mockRequest
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        release = resolve;
                    })
            )
            .mockResolvedValue({ success: true });
        const { result } = renderWithOrg();

        let pending: Promise<void> = Promise.resolve();
        act(() => {
            pending = result.current.regenerateAiFiles();
        });

        expect(result.current.aiBusy).toBe(true);

        await act(async () => {
            release({ success: true });
            await pending;
        });

        expect(result.current.aiBusy).toBe(false);
    });

    it('treats an EMPTY response as a success rather than crashing on it', async () => {
        mocks.mockRequest.mockResolvedValue(undefined);
        const { result } = renderWithOrg();

        await regenerate(result);

        expect(result.current.aiRegenError).toBeNull();
    });

    it('marks the AI badge failed when the follow-up verify rejects', async () => {
        mocks.mockRequest.mockImplementation((type: string) =>
            type === 'verify-ai-setup'
                ? Promise.reject(new Error('the MCP binary is missing'))
                : Promise.resolve({ success: true })
        );
        const { result } = renderWithOrg();

        await regenerate(result);

        // A rejected verify is not a regenerate failure — the files were written.
        expect(result.current.aiRegenError).toBeNull();
        expect(result.current.aiReady.color).toBe('yellow');
    });

    it('clears a previous verify failure when the follow-up verify succeeds', async () => {
        mocks.mockRequest.mockImplementation((type: string) =>
            type === 'verify-ai-setup'
                ? Promise.reject(new Error('first verify failed'))
                : Promise.resolve({ success: true })
        );
        const { result } = renderWithOrg();
        await regenerate(result);
        expect(result.current.aiReady.color).toBe('yellow');

        mocks.mockRequest.mockImplementation((type: string) =>
            type === 'verify-ai-setup'
                ? Promise.resolve({
                      success: true,
                      status: 'ok',
                      checks: [{ name: 'AGENTS.md', status: 'ok' }],
                      inventory: { skills: [], mcps: [], sessionMcps: [] },
                  })
                : Promise.resolve({ success: true })
        );
        await regenerate(result);

        expect(result.current.aiReady.color).toBe('green');
        // The inventory lists read the same flag: leaving it set shows an
        // inspector error beside a verify that had just succeeded.
        expect(result.current.aiSkillsError).toBe(false);
        expect(result.current.aiMcpsError).toBe(false);
    });

    it('does NOT re-verify after a rejected regenerate — there is nothing to verify', async () => {
        mocks.mockRequest.mockRejectedValue(new Error('boom'));
        const { result } = renderWithOrg();

        await regenerate(result);

        expect(mocks.mockRequest).not.toHaveBeenCalledWith('verify-ai-setup', {});
    });
});

describe('the regenerate progress channel', () => {
    /** Deliver a creationProgress payload (the channel the regenerate reuses). */
    function deliverProgress(payload: unknown): void {
        const call = mocks.mockOnMessage.mock.calls.find(
            ([type]) => type === 'creationProgress'
        ) as [string, (data: unknown) => void] | undefined;
        act(() => {
            call?.[1](payload);
        });
    }

    it('surfaces the step, its message and its percentage', () => {
        const { result } = renderWithOrg();

        deliverProgress({
            currentOperation: 'Writing AGENTS.md',
            message: 'Composing sections',
            progress: 40,
        });

        expect(result.current.aiRegenProgress).toEqual({
            currentOperation: 'Writing AGENTS.md',
            message: 'Composing sections',
            progress: 40,
        });
    });

    it('IGNORES a payload with no step name — there is nothing to render', () => {
        const { result } = renderWithOrg();

        deliverProgress({ message: 'something happened', progress: 10 });

        expect(result.current.aiRegenProgress).toBeNull();
    });

    it('ignores an empty payload without throwing', () => {
        const { result } = renderWithOrg();

        deliverProgress(undefined);

        expect(result.current.aiRegenProgress).toBeNull();
    });
});

describe('derived values with nothing loaded yet', () => {
    it('assumes port 3000 until a status arrives', () => {
        const { result } = renderWithOrg();

        expect(result.current.demoStatusDisplay).toEqual({ color: 'gray', text: 'Ready' });
    });

    it('falls back to port 3000 for a running demo that reports no port', () => {
        const { result } = renderWithOrg();

        act(() => {
            mocks.state.statusHandler?.({ status: 'running' });
        });

        expect(result.current.demoStatusDisplay).toEqual({
            color: 'green',
            text: 'Running on port 3000',
        });
    });

    it('uses the reported port when there is one', () => {
        const { result } = renderWithOrg();

        act(() => {
            mocks.state.statusHandler?.({ status: 'running', port: 4200 });
        });

        expect(result.current.demoStatusDisplay).toEqual({
            color: 'green',
            text: 'Running on port 4200',
        });
    });

    it('starts stopped and not transitioning', () => {
        const { result } = renderWithOrg();

        expect(result.current.isRunning).toBe(false);
        expect(result.current.isTransitioning).toBe(false);
        expect(result.current.aiBusy).toBe(false);
        expect(result.current.aiRegenError).toBeNull();
    });
});

describe('the mesh badge for states the shared vocabulary does not carry', () => {
    /** Push a mesh status through the statusUpdate channel. */
    function meshStatus(status: string): void {
        act(() => {
            mocks.state.statusHandler?.({ status: 'ready', mesh: { status } });
        });
    }

    it('shows a transient Checking status... while the mesh is being read', () => {
        const { result } = renderHook(() => useDashboardStatus({ hasMesh: true }));

        meshStatus('checking');

        expect(result.current.meshStatusDisplay).toEqual({
            color: 'blue',
            text: 'Checking status...',
        });
    });

    it('falls back to a neutral Unknown for a status nothing recognises', () => {
        const { result } = renderHook(() => useDashboardStatus({ hasMesh: true }));

        meshStatus('some-status-from-a-newer-build');

        expect(result.current.meshStatusDisplay).toEqual({ color: 'gray', text: 'Unknown' });
    });

    it('keeps showing Loading status... for a mesh project whose status has not arrived', () => {
        const { result } = renderHook(() => useDashboardStatus({ hasMesh: true }));

        act(() => {
            mocks.state.statusHandler?.({ status: 'ready' });
        });

        expect(result.current.meshStatusDisplay).toEqual({
            color: 'blue',
            text: 'Loading status...',
        });
    });

    it('shows Loading status... before anything has arrived, mesh or not', () => {
        const { result } = renderHook(() => useDashboardStatus({ hasMesh: false }));

        // Nothing is known yet; hiding the section here makes it appear later,
        // which reads as the page jumping.
        expect(result.current.meshStatusDisplay).toEqual({
            color: 'blue',
            text: 'Loading status...',
        });
    });

    it('hides the mesh section once a status arrives for a project with no mesh', () => {
        const { result } = renderHook(() => useDashboardStatus({ hasMesh: false }));

        act(() => {
            mocks.state.statusHandler?.({ status: 'ready' });
        });

        expect(result.current.meshStatusDisplay).toBeNull();
    });
});
