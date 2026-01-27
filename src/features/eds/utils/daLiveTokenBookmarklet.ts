/**
 * DA.live Token Bookmarklet Generator
 *
 * Generates a bookmarklet that extracts the Adobe IMS token from da.live
 * and displays it in a styled modal for easy copying.
 */

// --- Spectrum dark theme tokens used by the bookmarklet ---
const COLORS = {
    backdrop: 'rgba(0,0,0,0.7)',
    surface: '#252525',
    border: '#383838',
    textPrimary: '#fff',
    textSecondary: '#b3b3b3',
    accent: '#0d66d0',
    accentHover: '#095aba',
    success: '#2d9d78',
    error: '#e34850',
} as const;

const FONT_STACK = 'adobe-clean,Source Sans Pro,system-ui,sans-serif';

const AUTO_DISMISS_MS = 800;

/**
 * The bookmarklet code that runs on da.live to extract and display the token.
 * This creates a modal overlay with a copy button (no token shown).
 *
 * NOTE: This runs in a `javascript:` URL so it must use `var` (no `const`/`let`),
 * no arrow functions, and no template literals. Comments are stripped by the minifier
 * before newlines are removed.
 */
const BOOKMARKLET_CODE = `
(function() {
  // Toggle: remove existing modal if already open
  var existing = document.getElementById('da-token-modal');
  if (existing) { existing.remove(); return; }

  // Extract IMS token
  var token = null;
  try {
    token = window.adobeIMS
      && window.adobeIMS.getAccessToken
      && window.adobeIMS.getAccessToken();
    if (token && token.token) token = token.token;
  } catch(e) { token = null; }

  // Shared styles
  var card = 'background:${COLORS.surface};padding:40px;border-radius:8px;'
    + 'text-align:center;color:${COLORS.textPrimary};border:1px solid ${COLORS.border};';
  var heading = 'margin:0 0 8px;font-size:22px;font-weight:600;';
  var subtitle = 'color:${COLORS.textSecondary};font-size:14px;';

  // Build modal backdrop
  var modal = document.createElement('div');
  modal.id = 'da-token-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:999999;'
    + 'display:flex;align-items:center;justify-content:center;'
    + 'background:${COLORS.backdrop};font-family:${FONT_STACK};';

  if (!token) {
    // Not logged in state
    modal.innerHTML = '<div style="' + card + 'max-width:360px">'
      + '<h2 style="color:${COLORS.error};' + heading + '">Not Logged In</h2>'
      + '<p style="' + subtitle + 'margin:0">Please log in to DA.live first, then try again.</p>'
      + '</div>';
  } else {
    // Token ready state
    modal.innerHTML = '<div style="' + card + 'max-width:400px">'
      + '<h2 style="' + heading + '">Token Ready</h2>'
      + '<p style="' + subtitle + 'margin:0 0 24px">Click to copy, then paste in VS Code</p>'
      + '<button id="da-copy-btn" style="background:${COLORS.accent};color:#fff;border:none;'
      + 'padding:10px 24px;border-radius:4px;cursor:pointer;font-weight:600;font-size:14px;'
      + 'transition:background .15s">Copy Token</button>'
      + '</div>';

    // Wire up copy button after insertion
    setTimeout(function() {
      var btn = document.getElementById('da-copy-btn');
      btn.onmouseover = function() { this.style.background = '${COLORS.accentHover}'; };
      btn.onmouseout = function() { this.style.background = '${COLORS.accent}'; };
      btn.onclick = function() {
        navigator.clipboard.writeText(token).then(function() {
          btn.textContent = 'Copied!';
          btn.style.background = '${COLORS.success}';
          setTimeout(function() {
            document.getElementById('da-token-modal').remove();
          }, ${AUTO_DISMISS_MS});
        });
      };
    }, 0);
  }

  // Dismiss on backdrop click
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
    // Minify: strip // comments first (before removing newlines), then collapse whitespace
    const minified = BOOKMARKLET_CODE
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\n/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    return `javascript:${encodeURIComponent(minified)}`;
}

