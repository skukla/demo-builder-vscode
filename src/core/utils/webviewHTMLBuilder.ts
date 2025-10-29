import * as vscode from 'vscode';

/**
 * Webview HTML Builder
 *
 * Generates HTML for VS Code webviews with proper CSP, nonce, and script loading.
 */

export interface WebviewHTMLOptions {
    scriptUri: vscode.Uri;
    nonce: string;
    title: string;
    cspSource: string;
    includeLoadingSpinner?: boolean;
    loadingMessage?: string;
    isDark?: boolean;
    fallbackBundleUri?: vscode.Uri;
    additionalImgSources?: string[];
}

export function generateWebviewHTML(options: WebviewHTMLOptions): string {
    const {
        scriptUri,
        nonce,
        title,
        cspSource,
        includeLoadingSpinner = false,
        loadingMessage = 'Loading...',
        isDark = false,
        fallbackBundleUri,
        additionalImgSources = []
    } = options;

    const imgSources = ['https:', 'data:', ...additionalImgSources].join(' ');
    const loadingStyles = includeLoadingSpinner ? getLoadingStyles(isDark) : '';
    const loadingHTML = includeLoadingSpinner ? getLoadingHTML(loadingMessage, isDark) : '';
    const fallbackScript = fallbackBundleUri ? `<script nonce="${nonce}" src="${fallbackBundleUri}"></script>` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        style-src ${cspSource} 'unsafe-inline';
        script-src 'nonce-${nonce}' ${cspSource};
        img-src ${imgSources};
        font-src ${cspSource};
    ">
    <title>${title}</title>
    ${loadingStyles}
</head>
<body>
    ${loadingHTML}
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
    ${fallbackScript}
</body>
</html>`;
}

function getLoadingStyles(isDark: boolean): string {
    const bgColor = isDark ? '#1e1e1e' : '#ffffff';
    const textColor = isDark ? '#cccccc' : '#333333';
    const trackColor = isDark ? '#3a3a3a' : '#e1e1e1';
    const fillColor = '#0078d4';

    return `<style>
        body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            background: ${bgColor};
            color: ${textColor};
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }
        .loading-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
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
            border: 3px solid ${trackColor};
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
            border-top-color: ${fillColor};
            border-left-color: ${fillColor};
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
    </style>`;
}

function getLoadingHTML(message: string, isDark: boolean): string {
    return `
    <div class="loading-container">
        <div class="spinner">
            <div class="spinner-track"></div>
            <div class="spinner-fill"></div>
        </div>
        <div class="loading-text">${message}</div>
    </div>`;
}
