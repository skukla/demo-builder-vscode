/**
 * useDashboardActions Hook Tests
 *
 * Tests for the extracted dashboard action handlers hook.
 * Verifies all action handlers work correctly.
 *
 */

import { renderHook, act } from '@testing-library/react';

// Mock TIMEOUTS - uses semantic categories
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        UI: {
            UPDATE_DELAY: 100,
            ANIMATION: 150,
            TRANSITION: 300,
        },
    },
}));

// Mock FRONTEND_TIMEOUTS - must be before import
jest.mock('@/core/ui/utils/frontendTimeouts', () => ({
    FRONTEND_TIMEOUTS: {
        DOUBLE_CLICK_PREVENTION: 1000,
    },
}));

// Mock the WebviewClient - must be before import
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        request: jest.fn().mockResolvedValue({ success: true }),
    },
}));

import {
    useDashboardActions,
    UseDashboardActionsProps,
} from '@/features/dashboard/ui/hooks/useDashboardActions';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

describe('useDashboardActions', () => {
    let mockSetIsTransitioning: jest.Mock;
    let mockSetIsOpeningBrowser: jest.Mock;
    const mockPostMessage = webviewClient.postMessage as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        mockSetIsTransitioning = jest.fn();
        mockSetIsOpeningBrowser = jest.fn();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const renderActionsHook = (
        isOpeningBrowser = false,
        extra: { edsLiveUrl?: string; edsDaLiveUrl?: string } = {}
    ) => {
        return renderHook(() =>
            useDashboardActions({
                isOpeningBrowser,
                setIsTransitioning: mockSetIsTransitioning,
                setIsOpeningBrowser: mockSetIsOpeningBrowser,
                ...extra,
            })
        );
    };

    /**
     * Render with the props held as `initialProps`, so a test can hand the hook a
     * CHANGED prop and call the handler afterwards. That is the only way to observe a
     * handler's dependency list: a callback memoised on a stale dependency keeps the
     * value it captured on the first render, and every assertion below is about which
     * value the handler actually used.
     */
    const renderWithProps = (initialProps: UseDashboardActionsProps) =>
        renderHook((props: UseDashboardActionsProps) => useDashboardActions(props), {
            initialProps,
        });

    const baseProps = (): UseDashboardActionsProps => ({
        isOpeningBrowser: false,
        setIsTransitioning: mockSetIsTransitioning,
        setIsOpeningBrowser: mockSetIsOpeningBrowser,
    });

    describe('Action Handler Existence', () => {
        it('should return all action handlers', () => {
            const { result } = renderActionsHook();

            expect(result.current.handleStartDemo).toBeDefined();
            expect(result.current.handleStopDemo).toBeDefined();
            expect(result.current.handleDeployMesh).toBeDefined();
            expect(result.current.handleOpenBrowser).toBeDefined();
            expect(result.current.handleConfigure).toBeDefined();
            expect(result.current.handleOpenDevConsole).toBeDefined();
            expect(result.current.handleDeleteProject).toBeDefined();
            expect(result.current.handleNavigateBack).toBeDefined();
            expect(result.current.handleReAuthenticate).toBeDefined();
            expect(result.current.handleEditProject).toBeDefined();
            expect(result.current.handleExportProject).toBeDefined();
            expect(result.current.handleRepublishContent).toBeDefined();
            expect(result.current.handleResetProject).toBeDefined();
        });

        it('should return functions for all handlers', () => {
            const { result } = renderActionsHook();

            expect(typeof result.current.handleStartDemo).toBe('function');
            expect(typeof result.current.handleStopDemo).toBe('function');
            expect(typeof result.current.handleDeployMesh).toBe('function');
            expect(typeof result.current.handleOpenBrowser).toBe('function');
            expect(typeof result.current.handleConfigure).toBe('function');
            expect(typeof result.current.handleOpenDevConsole).toBe('function');
            expect(typeof result.current.handleDeleteProject).toBe('function');
            expect(typeof result.current.handleNavigateBack).toBe('function');
            expect(typeof result.current.handleReAuthenticate).toBe('function');
        });
    });

    describe('Start/Stop Actions', () => {
        it('should set transitioning state and send startDemo message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleStartDemo();
            });

            expect(mockSetIsTransitioning).toHaveBeenCalledWith(true);
            expect(mockPostMessage).toHaveBeenCalledWith('startDemo');
        });

        it('should set transitioning state and send stopDemo message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleStopDemo();
            });

            expect(mockSetIsTransitioning).toHaveBeenCalledWith(true);
            expect(mockPostMessage).toHaveBeenCalledWith('stopDemo');
        });
    });

    describe('Open Browser Action', () => {
        it('should send openBrowser message when not already opening', () => {
            const { result } = renderActionsHook(false);

            act(() => {
                result.current.handleOpenBrowser();
            });

            expect(mockSetIsOpeningBrowser).toHaveBeenCalledWith(true);
            expect(mockPostMessage).toHaveBeenCalledWith('openBrowser');
        });

        it('should prevent double-click when already opening', () => {
            const { result } = renderActionsHook(true);

            act(() => {
                result.current.handleOpenBrowser();
            });

            expect(mockSetIsOpeningBrowser).not.toHaveBeenCalled();
            expect(mockPostMessage).not.toHaveBeenCalled();
        });

        it('should re-enable opening after timeout', () => {
            const { result } = renderActionsHook(false);

            act(() => {
                result.current.handleOpenBrowser();
            });

            expect(mockSetIsOpeningBrowser).toHaveBeenCalledWith(true);

            act(() => {
                jest.advanceTimersByTime(1000);
            });

            expect(mockSetIsOpeningBrowser).toHaveBeenCalledWith(false);
        });
    });

    describe('Mesh Deploy Action', () => {
        it('should set transitioning state and send deployMesh message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleDeployMesh();
            });

            expect(mockSetIsTransitioning).toHaveBeenCalledWith(true);
            expect(mockPostMessage).toHaveBeenCalledWith('deployMesh');
        });
    });

    describe('Simple Message Actions', () => {
        it('should send configure message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleConfigure();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('configure');
        });

        it('should send openDevConsole message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleOpenDevConsole();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('openDevConsole');
        });

        it('should send deleteProject message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleDeleteProject();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('deleteProject');
        });

        it('should send navigateBack message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleNavigateBack();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('navigateBack');
        });

        it('should send reAuthenticate message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleReAuthenticate();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('reAuthenticate');
        });

        it('should request switchOrg (round-trip for in-flight feedback)', async () => {
            const mockRequest = webviewClient.request as jest.Mock;
            const { result } = renderActionsHook();

            await act(async () => {
                await result.current.handleSwitchOrg();
            });

            expect(mockRequest).toHaveBeenCalledWith('switchOrg');
        });

        it('should send openAdminPanel message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleOpenAdminPanel();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('openAdminPanel');
        });

        it('should send editProject message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleEditProject();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('editProject');
        });

        it('should send exportProject message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleExportProject();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('exportProject');
        });

        it('should send republishContent message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleRepublishContent();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('republishContent');
        });

        it('should send resetProject message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleResetProject();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('resetProject');
        });
    });

    // The authoring-experience flip was relocated to the Configure webview
    // (setup-time preference with an explicit Save), so the hook no longer
    // exposes handleSetAuthoringExperience.
    describe('Authoring Experience (flip removed)', () => {
        it('does not expose a handleSetAuthoringExperience handler', () => {
            const { result } = renderActionsHook();

            expect(
                (result.current as unknown as Record<string, unknown>).handleSetAuthoringExperience
            ).toBeUndefined();
        });
    });

    describe('Restart Action', () => {
        it('should set transitioning state and send restartDemo message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleRestartDemo();
            });

            // One message, not a stop/start pair: the extension owns the sequencing
            // and its settle delay.
            expect(mockSetIsTransitioning).toHaveBeenCalledWith(true);
            expect(mockPostMessage).toHaveBeenCalledTimes(1);
            expect(mockPostMessage).toHaveBeenCalledWith('restartDemo');
        });
    });

    describe('Storefront Actions', () => {
        it('should send syncStorefront without entering the transitioning state', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleSyncStorefront();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('syncStorefront');
            expect(mockSetIsTransitioning).not.toHaveBeenCalled();
        });

        it('should send refreshBlockLibrary without entering the transitioning state', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleRefreshBlockLibrary();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('refreshBlockLibrary');
            expect(mockSetIsTransitioning).not.toHaveBeenCalled();
        });
    });

    describe('Open Live Site Action', () => {
        const LIVE_URL = 'https://main--demo--acme.aem.live/';

        it('should send openLiveSite carrying the live URL', () => {
            const { result } = renderActionsHook(false, { edsLiveUrl: LIVE_URL });

            act(() => {
                result.current.handleOpenLiveSite();
            });

            expect(mockSetIsOpeningBrowser).toHaveBeenCalledWith(true);
            expect(mockPostMessage).toHaveBeenCalledWith('openLiveSite', { url: LIVE_URL });
        });

        it('should do nothing when there is no live URL', () => {
            const { result } = renderActionsHook(false);

            act(() => {
                result.current.handleOpenLiveSite();
            });

            expect(mockPostMessage).not.toHaveBeenCalled();
            expect(mockSetIsOpeningBrowser).not.toHaveBeenCalled();
        });

        it('should prevent double-click when already opening', () => {
            const { result } = renderActionsHook(true, { edsLiveUrl: LIVE_URL });

            act(() => {
                result.current.handleOpenLiveSite();
            });

            expect(mockPostMessage).not.toHaveBeenCalled();
            expect(mockSetIsOpeningBrowser).not.toHaveBeenCalled();
        });

        it('should re-enable opening after the double-click delay', () => {
            const { result } = renderActionsHook(false, { edsLiveUrl: LIVE_URL });

            act(() => {
                result.current.handleOpenLiveSite();
            });
            act(() => {
                jest.advanceTimersByTime(1000);
            });

            expect(mockSetIsOpeningBrowser).toHaveBeenLastCalledWith(false);
        });
    });

    describe('Open DA.live Action', () => {
        const DA_URL = 'https://da.live/#/acme/demo';

        it('should send openDaLive carrying the authoring URL', () => {
            const { result } = renderActionsHook(false, { edsDaLiveUrl: DA_URL });

            act(() => {
                result.current.handleOpenDaLive();
            });

            expect(mockSetIsOpeningBrowser).toHaveBeenCalledWith(true);
            expect(mockPostMessage).toHaveBeenCalledWith('openDaLive', { url: DA_URL });
        });

        it('should do nothing when there is no DA.live URL', () => {
            const { result } = renderActionsHook(false);

            act(() => {
                result.current.handleOpenDaLive();
            });

            expect(mockPostMessage).not.toHaveBeenCalled();
            expect(mockSetIsOpeningBrowser).not.toHaveBeenCalled();
        });

        it('should prevent double-click when already opening', () => {
            const { result } = renderActionsHook(true, { edsDaLiveUrl: DA_URL });

            act(() => {
                result.current.handleOpenDaLive();
            });

            expect(mockPostMessage).not.toHaveBeenCalled();
            expect(mockSetIsOpeningBrowser).not.toHaveBeenCalled();
        });

        it('should re-enable opening after the double-click delay', () => {
            const { result } = renderActionsHook(false, { edsDaLiveUrl: DA_URL });

            act(() => {
                result.current.handleOpenDaLive();
            });
            act(() => {
                jest.advanceTimersByTime(1000);
            });

            expect(mockSetIsOpeningBrowser).toHaveBeenLastCalledWith(false);
        });
    });

    // A handler is stable ACROSS renders (above) but must still act on the props of
    // the LATEST render. These are the same question from the other side: a handler
    // memoised on too few dependencies keeps the value it captured first, and the
    // dashboard then starts a demo through a setter the screen has replaced, or opens
    // a URL the project no longer has.
    describe('Handlers act on the latest props', () => {
        it('should call the current setIsTransitioning after the setter prop changes', () => {
            const firstSetter = jest.fn();
            const secondSetter = jest.fn();
            const { result, rerender } = renderWithProps({
                ...baseProps(),
                setIsTransitioning: firstSetter,
            });

            rerender({ ...baseProps(), setIsTransitioning: secondSetter });

            act(() => {
                result.current.handleStartDemo();
                result.current.handleStopDemo();
                result.current.handleRestartDemo();
                result.current.handleDeployMesh();
            });

            expect(secondSetter).toHaveBeenCalledTimes(4);
            expect(firstSetter).not.toHaveBeenCalled();
        });

        it('should block openBrowser once isOpeningBrowser flips to true', () => {
            const { result, rerender } = renderWithProps(baseProps());

            rerender({ ...baseProps(), isOpeningBrowser: true });

            act(() => {
                result.current.handleOpenBrowser();
            });

            expect(mockPostMessage).not.toHaveBeenCalled();
        });

        it('should send the live URL from the latest render', () => {
            const { result, rerender } = renderWithProps({
                ...baseProps(),
                edsLiveUrl: 'https://old--demo--acme.aem.live/',
            });

            rerender({ ...baseProps(), edsLiveUrl: 'https://new--demo--acme.aem.live/' });

            act(() => {
                result.current.handleOpenLiveSite();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('openLiveSite', {
                url: 'https://new--demo--acme.aem.live/',
            });
        });

        it('should send the DA.live URL from the latest render', () => {
            const { result, rerender } = renderWithProps({
                ...baseProps(),
                edsDaLiveUrl: 'https://da.live/#/acme/old',
            });

            rerender({ ...baseProps(), edsDaLiveUrl: 'https://da.live/#/acme/new' });

            act(() => {
                result.current.handleOpenDaLive();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('openDaLive', {
                url: 'https://da.live/#/acme/new',
            });
        });
    });

    describe('Handler Stability', () => {
        it('should return stable handler references', () => {
            const { result, rerender } = renderActionsHook();

            const initialHandlers = { ...result.current };

            rerender();

            // All handlers should be stable (same reference)
            expect(result.current.handleStartDemo).toBe(initialHandlers.handleStartDemo);
            expect(result.current.handleStopDemo).toBe(initialHandlers.handleStopDemo);
            expect(result.current.handleDeployMesh).toBe(initialHandlers.handleDeployMesh);
            expect(result.current.handleConfigure).toBe(initialHandlers.handleConfigure);
            expect(result.current.handleOpenDevConsole).toBe(initialHandlers.handleOpenDevConsole);
            expect(result.current.handleDeleteProject).toBe(initialHandlers.handleDeleteProject);
            expect(result.current.handleNavigateBack).toBe(initialHandlers.handleNavigateBack);
            expect(result.current.handleReAuthenticate).toBe(initialHandlers.handleReAuthenticate);
        });
    });

    // Note: Project reset (handleResetProject) is a backend-only handler in dashboardHandlers.ts.
    // They are NOT part of this frontend hook.
    // UI calls these via message passing from ActionGrid, not through this hook.
});
