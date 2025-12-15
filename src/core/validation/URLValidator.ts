/**
 * URL Validator
 *
 * Validates URLs to prevent:
 * - Server-Side Request Forgery (SSRF)
 * - Open redirect attacks
 * - Protocol injection
 */

/**
 * Check if hostname is a private IPv4 address (SOP §10 compliance)
 *
 * Private ranges: 10.0.0.0/8, 127.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16
 */
function isPrivateIPv4(hostname: string): boolean {
    if (hostname.startsWith('127.')) return true;
    if (hostname.startsWith('10.')) return true;
    if (hostname.startsWith('192.168.')) return true;
    if (hostname.startsWith('169.254.')) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
    return false;
}

/**
 * Validate that a URL is a valid GitHub download URL
 *
 * @param url - URL to validate
 * @returns True if the URL is a valid GitHub download URL, false otherwise
 */
export function validateGitHubDownloadURL(url: string): boolean {
    try {
        const parsedUrl = new URL(url);

        // Must be HTTPS
        if (parsedUrl.protocol !== 'https:') {
            return false;
        }

        // Must be from github.com domain
        if (!parsedUrl.hostname.endsWith('github.com') &&
            !parsedUrl.hostname.endsWith('githubusercontent.com')) {
            return false;
        }

        // Must be a releases download URL pattern
        const validPatterns = [
            /^\/[^/]+\/[^/]+\/releases\/download\//,  // Standard releases
            /^\/repos\/[^/]+\/[^/]+\/releases\/assets\//, // API endpoint
        ];

        return validPatterns.some(pattern => pattern.test(parsedUrl.pathname));
    } catch {
        // Invalid URL
        return false;
    }
}

/**
 * Validates URL to prevent open redirect and SSRF attacks
 *
 * Ensures URLs:
 * - Use allowed protocols (default: https only)
 * - Do not point to localhost or private networks (SSRF protection)
 * - Are properly formatted
 *
 * SECURITY: Use this function before making any HTTP requests with user-provided URLs
 * to prevent Server-Side Request Forgery (SSRF) and open redirect vulnerabilities.
 *
 * @param url - URL to validate
 * @param allowedProtocols - Array of allowed protocols (default: ['https'])
 * @throws Error if URL is invalid or unsafe
 *
 * @example
 * // Valid URLs
 * validateURL('https://example.com/path'); // OK
 * validateURL('https://api.adobe.com/data'); // OK
 *
 * // Invalid URLs
 * validateURL('javascript:alert(1)'); // Throws - invalid protocol
 * validateURL('https://localhost:3000'); // Throws - SSRF prevention
 * validateURL('https://192.168.1.1'); // Throws - private network
 */
export function validateURL(url: string, allowedProtocols: string[] = ['https']): void {
    if (!url || typeof url !== 'string') {
        throw new Error('URL must be a non-empty string');
    }

    try {
        const parsed = new URL(url);

        // Check protocol whitelist
        const protocol = parsed.protocol.replace(':', '');
        if (!allowedProtocols.includes(protocol)) {
            throw new Error(`URL protocol must be one of: ${allowedProtocols.join(', ')} (got: ${protocol})`);
        }

        // Prevent localhost/private IPs (SSRF protection)
        const hostname = parsed.hostname.toLowerCase();

        // Check for localhost variants
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
            throw new Error('URLs pointing to localhost are not allowed');
        }

        // Check for private IPv4 ranges (SOP §10: using predicate)
        if (isPrivateIPv4(hostname)) {
            throw new Error('URLs pointing to local/private networks are not allowed');
        }

        // Check for private IPv6 ranges (fc00::/7, fe80::/10)
        if (hostname.startsWith('[fc') || hostname.startsWith('[fd') || hostname.startsWith('[fe80:')) {
            throw new Error('URLs pointing to private IPv6 networks are not allowed');
        }

        // Additional check: prevent cloud metadata endpoints (common SSRF target)
        if (hostname === '169.254.169.254' || hostname === '[fd00:ec2::254]') {
            throw new Error('URLs pointing to cloud metadata endpoints are not allowed');
        }

    } catch (error) {
        // Re-throw our own errors
        if (error instanceof Error && error.message.startsWith('URL')) {
            throw error;
        }

        // Handle URL parse errors
        if (error instanceof TypeError) {
            throw new Error('Invalid URL format');
        }

        throw error;
    }
}
