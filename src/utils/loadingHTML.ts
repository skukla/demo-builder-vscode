import * as vscode from 'vscode';

/**
 * Utility for managing webview loading states with consistent UX.
 * Ensures loading spinners are visible for a minimum time to prevent jarring flashes.
 */

const MIN_DISPLAY_TIME = 1500; // milliseconds
const INIT_DELAY = 100; // milliseconds - prevents VSCode's "Initializing web view..." message

/**
 * Generates the HTML for a loading spinner.
 * This is pure HTML/CSS that works before any JavaScript bundles are loaded.
 * 
 * @param message - The loading message to display
 * @returns HTML string for the loading state
 */
function getLoadingHTML(message: string = 'Loading...'): string {
    const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
    
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${message}</title>
        <style>
            body, html {
                margin: 0;
                padding: 0;
                width: 100%;
                height: 100vh;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                background: ${isDark ? '#1e1e1e' : '#ffffff'};
                color: ${isDark ? '#cccccc' : '#333333'};
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            }
            .spinner {
                width: 32px;
                height: 32px;
                position: relative;
                display: inline-block;
            }
            .spinner-track {
                width: 100%;
                height: 100%;
                border: 3px solid ${isDark ? '#3a3a3a' : '#e1e1e1'};
                border-radius: 50%;
                box-sizing: border-box;
            }
            .spinner-fill {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                border: 3px solid transparent;
                border-top-color: ${isDark ? '#0078d4' : '#0078d4'};
                border-left-color: ${isDark ? '#0078d4' : '#0078d4'};
                border-radius: 50%;
                animation: spectrum-rotate 1s cubic-bezier(.25, .78, .48, .89) infinite;
                box-sizing: border-box;
            }
            @keyframes spectrum-rotate {
                0% { transform: rotate(-90deg); }
                100% { transform: rotate(270deg); }
            }
            .loading-text {
                margin-top: 20px;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <div class="spinner">
            <div class="spinner-track"></div>
            <div class="spinner-fill"></div>
        </div>
        <div class="loading-text">${message}</div>
    </body>
    </html>`;
}

/**
 * Sets a loading state on a webview panel and manages the transition to content.
 * Ensures the loading spinner is visible for a minimum time to provide good UX.
 * 
 * @param panel - The VSCode webview panel
 * @param getContent - Async function that returns the actual content HTML
 * @param message - Optional loading message (defaults to "Loading...")
 * @param logger - Optional logger for debugging
 */
export async function setLoadingState(
    panel: vscode.WebviewPanel,
    getContent: () => Promise<string>,
    message: string = 'Loading...',
    logger?: { info: (msg: string) => void }
): Promise<void> {
    // Give VSCode a moment to fully initialize the panel
    // This helps prevent the "Initializing web view..." message
    await new Promise(resolve => setTimeout(resolve, INIT_DELAY));
    
    // Set loading HTML
    panel.webview.html = getLoadingHTML(message);
    if (logger) {
        logger.info(`Loading HTML set with message: "${message}"`);
    }
    
    // Track load time to ensure minimum display time for spinner
    const startTime = Date.now();
    const contentHTML = await getContent();
    const elapsed = Date.now() - startTime;
    
    // Ensure spinner is visible for minimum time (prevents jarring instant transitions)
    if (elapsed < MIN_DISPLAY_TIME) {
        const remainingTime = MIN_DISPLAY_TIME - elapsed;
        if (logger) {
            logger.info(`Content loaded in ${elapsed}ms, waiting ${remainingTime}ms more for better UX`);
        }
        await new Promise(resolve => setTimeout(resolve, remainingTime));
    } else {
        if (logger) {
            logger.info(`Content loaded in ${elapsed}ms (no additional delay needed)`);
        }
    }
    
    // Set actual HTML content
    panel.webview.html = contentHTML;
    if (logger) {
        logger.info('Actual content HTML set for webview');
    }
}