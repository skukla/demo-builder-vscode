/**
 * useDashboardActions Hook Tests
 *
 * Tests for the extracted dashboard action handlers hook.
 * Verifies all action handlers work correctly.
 *
 * @jest-environment jsdom
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
    },
}));

import { useDashboardActions } from '@/features/dashboard/ui/hooks/useDashboardActions';
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
        extra: { edsLiveUrl?: string; edsDaLiveUrl?: string } = {},
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
            expect(result.current.handleCopyPath).toBeDefined();
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

        it('should send copyPath message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleCopyPath();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('copyPath');
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
                (result.current as Record<string, unknown>).handleSetAuthoringExperience,
            ).toBeUndefined();
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
