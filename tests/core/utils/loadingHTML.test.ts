import { setLoadingState } from '@/core/utils/loadingHTML';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import * as vscode from 'vscode';

// Mock vscode with ColorThemeKind
jest.mock('vscode', () => ({
    ColorThemeKind: {
        Light: 1,
        Dark: 2,
        HighContrast: 3,
        HighContrastLight: 4
    },
    window: {
        activeColorTheme: {
            kind: 2 // Dark
        }
    }
}));

describe('loadingHTML', () => {
    let mockPanel: vscode.WebviewPanel;
    let mockLogger: { info: jest.Mock; debug: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        mockPanel = {
            webview: {
                html: ''
            }
        } as any;

        mockLogger = {
            info: jest.fn(),
            debug: jest.fn()
        };
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
    });

    /**
     * Helper to advance time and allow promises to settle
     * Uses the modern jest.advanceTimersByTimeAsync which properly handles
     * promise-based timers.
     */
    async function advanceTime(ms: number): Promise<void> {
        await jest.advanceTimersByTimeAsync(ms);
    }

    describe('setLoadingState', () => {
        it('should set loading HTML after initial delay', async () => {
            const getContent = jest.fn().mockResolvedValue('<div>Main content</div>');

            const promise = setLoadingState(mockPanel, getContent);

            // Initially empty (before INIT_DELAY of 100ms)
            expect(mockPanel.webview.html).toBe('');

            // Advance past INIT_DELAY (100ms)
            await advanceTime(100);

            // Now loading HTML should be set
            expect(mockPanel.webview.html).toContain('Loading...');
            expect(mockPanel.webview.html).toContain('spinner');

            // Advance past MIN_DISPLAY_TIME to complete
            await advanceTime(1500);
            await promise;
        });

        it('should set actual content after loading', async () => {
            const actualContent = '<div>Actual content</div>';
            const getContent = jest.fn().mockResolvedValue(actualContent);

            const promise = setLoadingState(mockPanel, getContent);

            // Advance past INIT_DELAY + MIN_DISPLAY_TIME
            await advanceTime(1700);
            await promise;

            expect(mockPanel.webview.html).toBe(actualContent);
            expect(getContent).toHaveBeenCalled();
        });

        it('should use custom loading message', async () => {
            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');
            const customMessage = 'Setting up workspace...';

            const promise = setLoadingState(mockPanel, getContent, customMessage);

            // Advance past INIT_DELAY
            await advanceTime(100);

            expect(mockPanel.webview.html).toContain(customMessage);

            // Complete
            await advanceTime(1500);
            await promise;
        });

        it('should wait minimum display time for spinner', async () => {
            // This test verifies the MIN_DISPLAY_TIME behavior with fake timers
            const fastContent = '<div>Fast content</div>';
            const getContent = jest.fn().mockResolvedValue(fastContent);

            const promise = setLoadingState(mockPanel, getContent);

            // Advance past INIT_DELAY
            await advanceTime(100);
            expect(mockPanel.webview.html).toContain('Loading...');

            // Advance 1000ms - still should be loading (MIN_DISPLAY_TIME is 1500)
            await advanceTime(1000);
            expect(mockPanel.webview.html).toContain('Loading...');

            // Advance remaining 500ms to complete MIN_DISPLAY_TIME
            await advanceTime(500);
            await promise;
            expect(mockPanel.webview.html).toBe(fastContent);
        });

        it('should not add extra delay if content takes long to load', async () => {
            const slowContent = '<div>Slow content</div>';
            // Simulate slow content load that takes longer than MIN_DISPLAY_TIME
            const getContent = jest.fn().mockImplementation(async () => {
                // Simulate 2 second network delay
                await new Promise(resolve => setTimeout(resolve, 2000));
                return slowContent;
            });

            const promise = setLoadingState(mockPanel, getContent);

            // Advance past INIT_DELAY
            await advanceTime(100);
            expect(mockPanel.webview.html).toContain('Loading...');

            // Advance 2000ms for the "slow" content - should complete without extra delay
            await advanceTime(2000);
            await promise;

            expect(mockPanel.webview.html).toBe(slowContent);
        });

        it('should accept logger without throwing', async () => {
            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');

            const promise = setLoadingState(mockPanel, getContent, 'Loading...', mockLogger);

            await advanceTime(1700);

            await expect(promise).resolves.not.toThrow();
            expect(mockPanel.webview.html).toContain('Content');
        });

        it('should not throw when logger is not provided', async () => {
            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');

            const promise = setLoadingState(mockPanel, getContent);

            await advanceTime(1700);

            await expect(promise).resolves.not.toThrow();
        });

        it('should handle errors in getContent', async () => {
            // Use real timers for error handling test to avoid unhandled rejection issues
            jest.useRealTimers();

            const getContent = jest.fn().mockRejectedValue(new Error('Content load failed'));

            await expect(
                setLoadingState(mockPanel, getContent)
            ).rejects.toThrow('Content load failed');

            // Restore fake timers
            jest.useFakeTimers();
        });

        it('should include loading spinner HTML structure', async () => {
            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');

            const promise = setLoadingState(mockPanel, getContent);

            // Advance past INIT_DELAY
            await advanceTime(100);

            const loadingHTML = mockPanel.webview.html;

            expect(loadingHTML).toContain('<!DOCTYPE html>');
            expect(loadingHTML).toContain('<div class="spinner">');
            expect(loadingHTML).toContain('<div class="spinner-track">');
            expect(loadingHTML).toContain('<div class="spinner-fill">');
            expect(loadingHTML).toContain('@keyframes spectrum-rotate');

            await advanceTime(1500);
            await promise;
        });

        it('should use dark theme by default', async () => {
            (vscode.window as any).activeColorTheme = {
                kind: vscode.ColorThemeKind.Dark
            };

            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');

            const promise = setLoadingState(mockPanel, getContent);

            await advanceTime(100);

            const loadingHTML = mockPanel.webview.html;

            expect(loadingHTML).toContain('background: #1e1e1e');
            expect(loadingHTML).toContain('color: #cccccc');

            await advanceTime(1500);
            await promise;
        });

        it('should use light theme when active', async () => {
            (vscode.window as any).activeColorTheme = {
                kind: vscode.ColorThemeKind.Light
            };

            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');

            const promise = setLoadingState(mockPanel, getContent);

            await advanceTime(100);

            const loadingHTML = mockPanel.webview.html;

            expect(loadingHTML).toContain('background: #ffffff');
            expect(loadingHTML).toContain('color: #333333');

            await advanceTime(1500);
            await promise;
        });

        it('should include viewport meta tag', async () => {
            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');

            const promise = setLoadingState(mockPanel, getContent);

            await advanceTime(100);

            expect(mockPanel.webview.html).toContain(
                '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
            );

            await advanceTime(1500);
            await promise;
        });

        it('should have proper spinner animation', async () => {
            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');

            const promise = setLoadingState(mockPanel, getContent);

            await advanceTime(100);

            const loadingHTML = mockPanel.webview.html;

            expect(loadingHTML).toContain('animation: spectrum-rotate 1s');
            expect(loadingHTML).toContain('transform: rotate(-90deg)');
            expect(loadingHTML).toContain('transform: rotate(270deg)');

            await advanceTime(1500);
            await promise;
        });

        it('should wait for initial delay to prevent VSCode message', async () => {
            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');
            const initDelay = TIMEOUTS.WEBVIEW_INIT_DELAY; // Use actual timeout value

            const promise = setLoadingState(mockPanel, getContent);

            // Panel HTML should not be set immediately (before INIT_DELAY)
            expect(mockPanel.webview.html).toBe('');

            // Advance just before INIT_DELAY - still should be empty
            await advanceTime(initDelay - 10);
            expect(mockPanel.webview.html).toBe('');

            // Advance past INIT_DELAY - now loading should appear
            await advanceTime(20);
            expect(mockPanel.webview.html).toContain('Loading...');

            // Complete
            await advanceTime(TIMEOUTS.UI.MIN_LOADING);
            await promise;
        });

        it('should handle concurrent calls', async () => {
            const getContent1 = jest.fn().mockResolvedValue('<div>Content 1</div>');
            const getContent2 = jest.fn().mockResolvedValue('<div>Content 2</div>');

            const promise1 = setLoadingState(mockPanel, getContent1);
            const promise2 = setLoadingState(mockPanel, getContent2);

            await advanceTime(1700);
            await Promise.all([promise1, promise2]);

            // Last call should win
            expect(mockPanel.webview.html).toContain('Content');
        });
    });

    describe('Real-world scenarios', () => {
        it('should handle wizard initialization', async () => {
            const getWizardContent = jest.fn().mockImplementation(async () => {
                // Simulate slow initialization
                await new Promise(resolve => setTimeout(resolve, 500));
                return '<div id="wizard">Wizard Content</div>';
            });

            const promise = setLoadingState(
                mockPanel,
                getWizardContent,
                'Initializing wizard...',
                mockLogger
            );

            // Advance past INIT_DELAY
            await advanceTime(100);
            expect(mockPanel.webview.html).toContain('Initializing wizard...');

            // Advance past content load time (500ms) + remaining MIN_DISPLAY_TIME (1000ms)
            await advanceTime(1500);
            await promise;

            expect(mockPanel.webview.html).toContain('Wizard Content');
        });

        it('should handle dashboard loading', async () => {
            const getDashboardContent = jest.fn().mockResolvedValue(
                '<div id="dashboard">Dashboard Content</div>'
            );

            const promise = setLoadingState(
                mockPanel,
                getDashboardContent,
                'Loading dashboard...'
            );

            await advanceTime(1700);
            await promise;

            expect(mockPanel.webview.html).toContain('Dashboard Content');
        });

        it('should handle configuration UI', async () => {
            const getConfigContent = jest.fn().mockResolvedValue(
                '<div id="config">Configuration</div>'
            );

            const promise = setLoadingState(
                mockPanel,
                getConfigContent,
                'Loading configuration...'
            );

            await advanceTime(1700);
            await promise;

            expect(mockPanel.webview.html).toContain('Configuration');
        });
    });

    describe('UX considerations - timing verification', () => {
        // These tests use fake timers to verify timing behavior
        // without actually waiting for real time to pass

        it('should prevent jarring flash for fast loads', async () => {
            const fastGetContent = jest.fn().mockResolvedValue('<div>Fast</div>');

            const promise = setLoadingState(mockPanel, fastGetContent);

            // After INIT_DELAY, loading should be shown
            await advanceTime(100);
            expect(mockPanel.webview.html).toContain('Loading...');

            // At 1400ms (before MIN_DISPLAY_TIME of 1500), content should not be loaded yet
            await advanceTime(1300);
            expect(mockPanel.webview.html).toContain('Loading...');

            // After MIN_DISPLAY_TIME passes, content should be shown
            await advanceTime(200);
            await promise;
            expect(mockPanel.webview.html).toContain('Fast');
        });

        it('should not delay unnecessarily for slow loads', async () => {
            const slowGetContent = jest.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 2000));
                return '<div>Slow</div>';
            });

            const promise = setLoadingState(mockPanel, slowGetContent);

            // After INIT_DELAY + 2000ms (slow load), content should be ready
            // without additional MIN_DISPLAY_TIME wait (since 2000ms > 1500ms)
            await advanceTime(100);
            expect(mockPanel.webview.html).toContain('Loading...');

            // Advance past the slow load time
            await advanceTime(2000);
            await promise;

            // Content should be shown immediately after slow load completes
            expect(mockPanel.webview.html).toContain('Slow');
        });
    });
});
