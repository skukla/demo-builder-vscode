import { setLoadingState } from '@/core/utils/loadingHTML';
import * as vscode from 'vscode';

jest.mock('vscode');

describe('loadingHTML', () => {
    let mockPanel: vscode.WebviewPanel;
    let mockLogger: { info: jest.Mock; debug: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock vscode.ColorThemeKind
        (vscode as any).ColorThemeKind = {
            Light: 1,
            Dark: 2,
            HighContrast: 3,
            HighContrastLight: 4
        };

        mockPanel = {
            webview: {
                html: ''
            }
        } as any;

        mockLogger = {
            info: jest.fn(),
            debug: jest.fn()
        };

        // Mock activeColorTheme
        (vscode.window as any).activeColorTheme = {
            kind: (vscode as any).ColorThemeKind.Dark
        };
    });

    describe('setLoadingState', () => {
        it('should set loading HTML initially', async () => {
            const getContent = jest.fn().mockResolvedValue('<div>Main content</div>');

            const promise = setLoadingState(mockPanel, getContent);

            // Wait for initial delay
            await new Promise(resolve => setTimeout(resolve, 150));

            expect(mockPanel.webview.html).toContain('Loading...');
            expect(mockPanel.webview.html).toContain('spinner');

            await promise;
        });

        it('should set actual content after loading', async () => {
            const actualContent = '<div>Actual content</div>';
            const getContent = jest.fn().mockResolvedValue(actualContent);

            await setLoadingState(mockPanel, getContent);

            expect(mockPanel.webview.html).toBe(actualContent);
            expect(getContent).toHaveBeenCalled();
        });

        it('should use custom loading message', async () => {
            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');
            const customMessage = 'Setting up workspace...';

            const promise = setLoadingState(mockPanel, getContent, customMessage);

            await new Promise(resolve => setTimeout(resolve, 150));

            expect(mockPanel.webview.html).toContain(customMessage);

            await promise;
        });

        it('should ensure minimum display time for spinner', async () => {
            const fastContent = '<div>Fast content</div>';
            const getContent = jest.fn().mockResolvedValue(fastContent);

            const startTime = Date.now();
            await setLoadingState(mockPanel, getContent);
            const duration = Date.now() - startTime;

            // Should wait at least MIN_DISPLAY_TIME (1500ms) + INIT_DELAY (100ms)
            expect(duration).toBeGreaterThanOrEqual(1500);
        });

        it('should not add extra delay if content takes long to load', async () => {
            const slowContent = '<div>Slow content</div>';
            const getContent = jest.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 2000));
                return slowContent;
            });

            const startTime = Date.now();
            await setLoadingState(mockPanel, getContent);
            const duration = Date.now() - startTime;

            // Should not wait extra time beyond content load time
            expect(duration).toBeLessThan(2500);
        });

        it('should call logger when provided', async () => {
            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');

            await setLoadingState(mockPanel, getContent, 'Loading...', mockLogger);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Loading HTML set with message: "Loading..."'
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Actual content HTML set for webview'
            );
        });

        it('should not call logger when not provided', async () => {
            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');

            await expect(
                setLoadingState(mockPanel, getContent)
            ).resolves.not.toThrow();
        });

        it('should handle errors in getContent', async () => {
            const getContent = jest.fn().mockRejectedValue(new Error('Content load failed'));

            await expect(
                setLoadingState(mockPanel, getContent)
            ).rejects.toThrow('Content load failed');
        });

        it('should include loading spinner HTML structure', async () => {
            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');

            const promise = setLoadingState(mockPanel, getContent);

            await new Promise(resolve => setTimeout(resolve, 150));

            const loadingHTML = mockPanel.webview.html;

            expect(loadingHTML).toContain('<!DOCTYPE html>');
            expect(loadingHTML).toContain('<div class="spinner">');
            expect(loadingHTML).toContain('<div class="spinner-track">');
            expect(loadingHTML).toContain('<div class="spinner-fill">');
            expect(loadingHTML).toContain('@keyframes spectrum-rotate');

            await promise;
        });

        it('should use dark theme by default', async () => {
            (vscode.window as any).activeColorTheme = {
                kind: vscode.ColorThemeKind.Dark
            };

            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');

            const promise = setLoadingState(mockPanel, getContent);

            await new Promise(resolve => setTimeout(resolve, 150));

            const loadingHTML = mockPanel.webview.html;

            expect(loadingHTML).toContain('background: #1e1e1e');
            expect(loadingHTML).toContain('color: #cccccc');

            await promise;
        });

        it('should use light theme when active', async () => {
            (vscode.window as any).activeColorTheme = {
                kind: vscode.ColorThemeKind.Light
            };

            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');

            const promise = setLoadingState(mockPanel, getContent);

            await new Promise(resolve => setTimeout(resolve, 150));

            const loadingHTML = mockPanel.webview.html;

            expect(loadingHTML).toContain('background: #ffffff');
            expect(loadingHTML).toContain('color: #333333');

            await promise;
        });

        it('should include viewport meta tag', async () => {
            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');

            const promise = setLoadingState(mockPanel, getContent);

            await new Promise(resolve => setTimeout(resolve, 150));

            expect(mockPanel.webview.html).toContain(
                '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
            );

            await promise;
        });

        it('should have proper spinner animation', async () => {
            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');

            const promise = setLoadingState(mockPanel, getContent);

            await new Promise(resolve => setTimeout(resolve, 150));

            const loadingHTML = mockPanel.webview.html;

            expect(loadingHTML).toContain('animation: spectrum-rotate 1s');
            expect(loadingHTML).toContain('transform: rotate(-90deg)');
            expect(loadingHTML).toContain('transform: rotate(270deg)');

            await promise;
        });

        it('should wait for initial delay to prevent VSCode message', async () => {
            const getContent = jest.fn().mockResolvedValue('<div>Content</div>');

            const startTime = Date.now();

            const promise = setLoadingState(mockPanel, getContent);

            // Panel HTML should not be set immediately
            const immediateHTML = mockPanel.webview.html;
            expect(immediateHTML).toBe('');

            await promise;

            const elapsed = Date.now() - startTime;

            // Should include INIT_DELAY (100ms)
            expect(elapsed).toBeGreaterThanOrEqual(100);
        });

        it('should handle concurrent calls', async () => {
            const getContent1 = jest.fn().mockResolvedValue('<div>Content 1</div>');
            const getContent2 = jest.fn().mockResolvedValue('<div>Content 2</div>');

            await Promise.all([
                setLoadingState(mockPanel, getContent1),
                setLoadingState(mockPanel, getContent2)
            ]);

            // Last call should win
            expect(mockPanel.webview.html).toContain('Content');
        });
    });

    describe('Real-world scenarios', () => {
        it('should handle wizard initialization', async () => {
            const getWizardContent = jest.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 500));
                return '<div id="wizard">Wizard Content</div>';
            });

            await setLoadingState(
                mockPanel,
                getWizardContent,
                'Initializing wizard...',
                mockLogger
            );

            expect(mockPanel.webview.html).toContain('Wizard Content');
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Loading HTML set with message: "Initializing wizard..."'
            );
        });

        it('should handle dashboard loading', async () => {
            const getDashboardContent = jest.fn().mockResolvedValue(
                '<div id="dashboard">Dashboard Content</div>'
            );

            await setLoadingState(
                mockPanel,
                getDashboardContent,
                'Loading dashboard...'
            );

            expect(mockPanel.webview.html).toContain('Dashboard Content');
        });

        it('should handle configuration UI', async () => {
            const getConfigContent = jest.fn().mockResolvedValue(
                '<div id="config">Configuration</div>'
            );

            await setLoadingState(
                mockPanel,
                getConfigContent,
                'Loading configuration...'
            );

            expect(mockPanel.webview.html).toContain('Configuration');
        });
    });

    describe('UX considerations', () => {
        it('should prevent jarring flash for fast loads', async () => {
            // Even if content loads in 100ms, spinner should show for full MIN_DISPLAY_TIME
            const fastGetContent = jest.fn().mockResolvedValue('<div>Fast</div>');

            const startTime = Date.now();
            await setLoadingState(mockPanel, fastGetContent);
            const duration = Date.now() - startTime;

            expect(duration).toBeGreaterThanOrEqual(1500);
        });

        it('should not delay unnecessarily for slow loads', async () => {
            const slowGetContent = jest.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 3000));
                return '<div>Slow</div>';
            });

            const startTime = Date.now();
            await setLoadingState(mockPanel, slowGetContent);
            const duration = Date.now() - startTime;

            // Should not add MIN_DISPLAY_TIME on top of 3s load time
            expect(duration).toBeLessThan(3500);
        });
    });
});
