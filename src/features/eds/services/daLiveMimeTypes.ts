/**
 * DA.live MIME Type Utilities
 *
 * Maps file extensions to MIME types for DA.live uploads.
 *
 * Extracted from DaLiveContentOperations for reusability.
 */

/**
 * MIME type mapping for common file extensions
 */
const MIME_TYPES: Record<string, string> = {
    // Images
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',

    // Video
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',

    // Documents
    '.pdf': 'application/pdf',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.txt': 'text/plain',

    // Web
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.html': 'text/html',
    '.htm': 'text/html',
};

/**
 * Get MIME type for a file extension
 *
 * @param ext - File extension including dot (e.g., '.jpg')
 * @returns MIME type string, defaults to 'application/octet-stream'
 */
export function getMimeType(ext: string): string {
    return MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream';
}
