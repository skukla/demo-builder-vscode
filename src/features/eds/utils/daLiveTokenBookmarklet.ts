/**
 * DA.live Token Bookmarklet Generator
 *
 * Generates a bookmarklet that extracts the Adobe IMS token from da.live
 * and displays it in a styled modal for easy copying.
 */

/**
 * The bookmarklet code that runs on da.live to extract and display the token.
 * This creates a modal overlay with the token and a copy button.
 */
const BOOKMARKLET_CODE = `
(function() {
  // Check if already showing modal
  if (document.getElementById('da-token-modal')) {
    document.getElementById('da-token-modal').remove();
    return;
  }

  // Try to get the token
  var token = null;
  try {
    token = window.adobeIMS && window.adobeIMS.getAccessToken && window.adobeIMS.getAccessToken();
    if (token && token.token) token = token.token;
  } catch(e) {
    token = null;
  }

  // Create modal
  var modal = document.createElement('div');
  modal.id = 'da-token-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';

  if (!token) {
    modal.innerHTML = '<div style="background:#1a1a1a;padding:32px;border-radius:12px;max-width:400px;text-align:center;color:#fff;"><h2 style="margin:0 0 16px;color:#f44336;">Not Logged In</h2><p style="margin:0 0 24px;color:#aaa;">Please log in to DA.live first, then try again.</p><button onclick="this.closest(\\'#da-token-modal\\').remove()" style="background:#333;color:#fff;border:none;padding:12px 24px;border-radius:6px;cursor:pointer;font-size:14px;">Close</button></div>';
  } else {
    var shortToken = token.substring(0, 50) + '...';
    modal.innerHTML = '<div style="background:#1a1a1a;padding:32px;border-radius:12px;max-width:500px;text-align:center;color:#fff;"><h2 style="margin:0 0 8px;color:#4caf50;">✓ Token Ready</h2><p style="margin:0 0 24px;color:#aaa;font-size:14px;">Click the button below to copy, then paste in VS Code.</p><div style="background:#0d0d0d;padding:12px;border-radius:6px;margin-bottom:24px;word-break:break-all;font-family:monospace;font-size:11px;color:#666;max-height:60px;overflow:hidden;">' + shortToken + '</div><button id="da-copy-btn" style="background:#1976d2;color:#fff;border:none;padding:14px 32px;border-radius:6px;cursor:pointer;font-size:16px;font-weight:500;">Copy Token</button><button onclick="this.closest(\\'#da-token-modal\\').remove()" style="background:transparent;color:#666;border:none;padding:14px 24px;cursor:pointer;font-size:14px;margin-left:8px;">Close</button></div>';

    setTimeout(function() {
      document.getElementById('da-copy-btn').onclick = function() {
        navigator.clipboard.writeText(token).then(function() {
          var btn = document.getElementById('da-copy-btn');
          btn.textContent = '✓ Copied!';
          btn.style.background = '#4caf50';
          setTimeout(function() {
            document.getElementById('da-token-modal').remove();
          }, 1000);
        });
      };
    }, 0);
  }

  // Close on backdrop click
  modal.onclick = function(e) {
    if (e.target === modal) modal.remove();
  };

  document.body.appendChild(modal);
})();
`;

/**
 * Get the bookmarklet as a javascript: URL that can be dragged to bookmarks bar
 */
export function getBookmarkletUrl(): string {
    // Minify and encode for bookmarklet URL
    const minified = BOOKMARKLET_CODE
        .replace(/\n/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    return `javascript:${encodeURIComponent(minified)}`;
}

/**
 * Get the bookmarklet code for display/documentation purposes
 */
export function getBookmarkletCode(): string {
    return BOOKMARKLET_CODE.trim();
}

/**
 * Get HTML for a draggable bookmarklet link
 */
export function getBookmarkletLinkHtml(): string {
    const url = getBookmarkletUrl();
    return `<a href="${url}" style="display:inline-block;background:#1976d2;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;font-weight:500;cursor:move;" onclick="return false;" title="Drag this to your bookmarks bar">📋 Get DA.live Token</a>`;
}
