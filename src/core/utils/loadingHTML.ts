import * as vscode from 'vscode';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Utility for managing webview loading states with consistent UX.
 * Ensures loading spinners are visible for a minimum time to prevent jarring flashes.
 */

const MIN_DISPLAY_TIME = TIMEOUTS.UI.MIN_LOADING; // milliseconds
const INIT_DELAY = TIMEOUTS.WEBVIEW_INIT_DELAY; // milliseconds - prevents VSCode's "Initializing web view..." message

/**
 * Page identity rendered at the top of the loading screen, mirroring PageHeader
 * (title + dimmed subtitle over a bottom border) so the spinner appears inside
 * an already-identified screen instead of an anonymous blank page.
 */
export interface LoadingHeader {
    title: string;
    subtitle?: string;
}

/** Escape user-influenced text (project names, messages) for HTML interpolation. */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Generates the HTML for a loading spinner.
 * This is pure HTML/CSS that works before any JavaScript bundles are loaded.
 *
 * @param message - The loading message to display
 * @param header - Optional page identity (title + subtitle) rendered as a
 *                 PageHeader-style band above the centered spinner
 * @returns HTML string for the loading state
 */
function getLoadingHTML(message = 'Loading...', header?: LoadingHeader): string {
    const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
    const safeMessage = escapeHtml(message);

    const headerHTML = header
        ? `<div class="loading-header">
            <span class="loading-header-title">${escapeHtml(header.title)}</span>${
                header.subtitle
                    ? `<span class="loading-header-subtitle">${escapeHtml(header.subtitle)}</span>`
                    : ''
            }
        </div>`
        : '';

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${safeMessage}</title>
        <style>
            body, html {
                margin: 0;
                padding: 0;
                width: 100%;
                height: 100vh;
                display: flex;
                flex-direction: column;
                background: ${isDark ? '#1e1e1e' : '#ffffff'};
                color: ${isDark ? '#cccccc' : '#333333'};
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            }
            /* Mirrors PageHeader's single-row band (title + dimmed subtitle,
               border-b) so the swap to the real header doesn't jump. */
            .loading-header {
                display: flex;
                align-items: baseline;
                gap: 12px;
                padding: 20px 32px;
                border-bottom: 1px solid ${isDark ? '#3a3a3a' : '#e1e1e1'};
            }
            .loading-header-title {
                font-size: 18px;
                font-weight: 700;
                line-height: 1.2;
            }
            .loading-header-subtitle {
                font-size: 13px;
                color: ${isDark ? '#8f8f8f' : '#6e6e6e'};
            }
            .loading-body {
                flex: 1;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
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
        ${headerHTML}
        <div class="loading-body">
            <div class="spinner">
                <div class="spinner-track"></div>
                <div class="spinner-fill"></div>
            </div>
            <div class="loading-text">${safeMessage}</div>
        </div>
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
 * @param header - Optional page identity (title + subtitle) shown above the spinner
 */
export async function setLoadingState(
    panel: vscode.WebviewPanel,
    getContent: () => Promise<string>,
    message = 'Loading...',
    _logger?: { info: (msg: string) => void; debug?: (msg: string) => void },
    header?: LoadingHeader,
): Promise<void> {
    // Give VSCode a moment to fully initialize the panel
    // This helps prevent the "Initializing web view..." message
    await new Promise((resolve) => setTimeout(resolve, INIT_DELAY));

    // Set loading HTML
    panel.webview.html = getLoadingHTML(message, header);

    // Track load time to ensure minimum display time for spinner
    const startTime = Date.now();
    const contentHTML = await getContent();
    const elapsed = Date.now() - startTime;

    // Ensure spinner is visible for minimum time (prevents jarring instant
    // transitions).
    if (elapsed < MIN_DISPLAY_TIME) {
        const remainingTime = MIN_DISPLAY_TIME - elapsed;
        await new Promise((resolve) => setTimeout(resolve, remainingTime));
    }

    // Set actual HTML content
    panel.webview.html = contentHTML;
}
