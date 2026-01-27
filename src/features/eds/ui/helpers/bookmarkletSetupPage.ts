/**
 * Bookmarklet Setup Page Generator
 *
 * Generates a data URL for a browser-based bookmarklet setup page.
 * Used by both DaLiveSetupStep and ConnectServicesStep when the user
 * hasn't completed the one-time bookmarklet installation.
 *
 * @param bookmarkletUrl - The javascript: URL for the bookmarklet (from backend)
 * @returns A data:text/html URL that can be opened in the browser
 */
export function getBookmarkletSetupPageUrl(bookmarkletUrl: string): string {
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>DA.live Token Helper</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: adobe-clean, 'Source Sans Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1e1e1e;
            color: #fff;
            min-height: 100vh;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: #252525;
            border-radius: 8px;
            padding: 40px;
            max-width: 480px;
            text-align: center;
            border: 1px solid #383838;
        }
        h1 { margin: 0 0 8px; font-size: 22px; font-weight: 600; }
        .subtitle { color: #b3b3b3; margin-bottom: 28px; font-size: 14px; }
        .step {
            background: #1e1e1e;
            border-radius: 6px;
            padding: 20px;
            margin: 12px 0;
            text-align: left;
            border: 1px solid #383838;
        }
        .step-number {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            background: #0d66d0;
            border-radius: 50%;
            font-size: 13px;
            font-weight: 600;
            margin-right: 12px;
            flex-shrink: 0;
        }
        .step-header { display: flex; align-items: center; }
        .step-title { font-weight: 600; font-size: 14px; }
        .step-desc { color: #b3b3b3; margin-top: 8px; margin-left: 36px; font-size: 13px; line-height: 1.5; }
        .bookmarklet {
            display: inline-block;
            padding: 10px 20px;
            background: #0d66d0;
            color: white !important;
            border-radius: 4px;
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
            cursor: grab;
            margin: 12px 0 0;
            transition: background 0.15s;
        }
        .bookmarklet:hover { background: #095aba; }
        .bookmarklet:active { cursor: grabbing; background: #0850a0; }
        .arrow { font-size: 18px; margin: 8px 0; color: #5c5c5c; }
        .action-btn {
            display: inline-block;
            padding: 8px 16px;
            background: #2d9d78;
            color: white;
            border-radius: 4px;
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
            transition: background 0.15s;
        }
        .action-btn:hover { background: #268e6c; }
        .skip-link { margin-top: 24px; font-size: 16px; }
        .skip-link a { color: #b3b3b3; text-decoration: none; }
        .skip-link a:hover { color: #fff; text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <h1>DA.live Token Helper</h1>
        <p class="subtitle">One-time setup to get your authentication token</p>

        <div class="step">
            <div class="step-header">
                <span class="step-number">1</span>
                <span class="step-title">Drag this button to your bookmarks bar</span>
            </div>
            <div class="step-desc">
                <a class="bookmarklet" href="${bookmarkletUrl.replace(/"/g, '&quot;')}">Get DA.live Token</a>
            </div>
        </div>

        <div class="arrow">\u2193</div>

        <div class="step">
            <div class="step-header">
                <span class="step-number">2</span>
                <span class="step-title">Go to DA.live and click the bookmarklet</span>
            </div>
            <div class="step-desc">
                It will show a popup with a "Copy Token" button
                <div style="margin-top: 12px;">
                    <a href="https://da.live" class="action-btn">Go to DA.live \u2192</a>
                </div>
            </div>
        </div>

        <div class="arrow">\u2193</div>

        <div class="step">
            <div class="step-header">
                <span class="step-number">3</span>
                <span class="step-title">Return to VS Code and paste the token</span>
            </div>
            <div class="step-desc">The token is now on your clipboard</div>
        </div>

        <p class="skip-link">
            <a href="https://da.live">Already have the bookmarklet? Go to DA.live \u2192</a>
        </p>
    </div>
</body>
</html>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
