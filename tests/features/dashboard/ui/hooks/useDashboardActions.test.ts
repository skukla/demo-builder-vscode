/**
 * useDashboardActions Hook Tests
 *
 * Tests for the extracted dashboard action handlers hook.
 * Verifies all 11 action handlers work correctly.
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
        HOVER_SUPPRESSION_DELAY: 500, // Custom UI timing
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
    let mockSetIsLogsHoverSuppressed: jest.Mock;
    const mockPostMessage = webviewClient.postMessage as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        mockSetIsTransitioning = jest.fn();
        mockSetIsOpeningBrowser = jest.fn();
        mockSetIsLogsHoverSuppressed = jest.fn();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const renderActionsHook = (isOpeningBrowser = false) => {
        return renderHook(() =>
            useDashboardActions({
                isOpeningBrowser,
                setIsTransitioning: mockSetIsTransitioning,
                setIsOpeningBrowser: mockSetIsOpeningBrowser,
                setIsLogsHoverSuppressed: mockSetIsLogsHoverSuppressed,
            })
        );
    };

    describe('Action Handler Existence', () => {
        it('should return all action handlers', () => {
            const { result } = renderActionsHook();

            expect(result.current.handleStartDemo).toBeDefined();
            expect(result.current.handleStopDemo).toBeDefined();
            expect(result.current.handleReAuthenticate).toBeDefined();
            expect(result.current.handleViewLogs).toBeDefined();
            expect(result.current.handleDeployMesh).toBeDefined();
            expect(result.current.handleOpenBrowser).toBeDefined();
            expect(result.current.handleConfigure).toBeDefined();
            expect(result.current.handleOpenDevConsole).toBeDefined();
            expect(result.current.handleDeleteProject).toBeDefined();
            expect(result.current.handleNavigateBack).toBeDefined();
            expect(result.current.handleViewComponents).toBeDefined();
        });

        it('should return functions for all handlers', () => {
            const { result } = renderActionsHook();

            expect(typeof result.current.handleStartDemo).toBe('function');
            expect(typeof result.current.handleStopDemo).toBe('function');
            expect(typeof result.current.handleReAuthenticate).toBe('function');
            expect(typeof result.current.handleViewLogs).toBe('function');
            expect(typeof result.current.handleDeployMesh).toBe('function');
            expect(typeof result.current.handleOpenBrowser).toBe('function');
            expect(typeof result.current.handleConfigure).toBe('function');
            expect(typeof result.current.handleOpenDevConsole).toBe('function');
            expect(typeof result.current.handleDeleteProject).toBe('function');
            expect(typeof result.current.handleNavigateBack).toBe('function');
            expect(typeof result.current.handleViewComponents).toBe('function');
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

    describe('View Logs Action', () => {
        it('should send viewLogs message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleViewLogs();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('viewLogs');
        });

        it('should suppress hover styles during layout shift', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleViewLogs();
            });

            expect(mockSetIsLogsHoverSuppressed).toHaveBeenCalledWith(true);
        });

        it('should re-enable hover styles after timeout', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleViewLogs();
            });

            expect(mockSetIsLogsHoverSuppressed).toHaveBeenCalledWith(true);

            act(() => {
                jest.advanceTimersByTime(500);
            });

            expect(mockSetIsLogsHoverSuppressed).toHaveBeenCalledWith(false);
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
        it('should send re-authenticate message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleReAuthenticate();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('re-authenticate');
        });

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

        it('should send viewComponents message', () => {
            const { result } = renderActionsHook();

            act(() => {
                result.current.handleViewComponents();
            });

            expect(mockPostMessage).toHaveBeenCalledWith('viewComponents');
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
            expect(result.current.handleReAuthenticate).toBe(initialHandlers.handleReAuthenticate);
            expect(result.current.handleDeployMesh).toBe(initialHandlers.handleDeployMesh);
            expect(result.current.handleConfigure).toBe(initialHandlers.handleConfigure);
            expect(result.current.handleOpenDevConsole).toBe(initialHandlers.handleOpenDevConsole);
            expect(result.current.handleDeleteProject).toBe(initialHandlers.handleDeleteProject);
            expect(result.current.handleNavigateBack).toBe(initialHandlers.handleNavigateBack);
            expect(result.current.handleViewComponents).toBe(initialHandlers.handleViewComponents);
        });
    });
});
