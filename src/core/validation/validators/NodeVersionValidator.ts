/**
 * Node Version Validator
 *
 * Validates Node.js version parameters to prevent command injection
 * in fnm/nvm shell commands.
 */

/**
 * Error message for invalid Node.js version format
 */
const INVALID_NODE_VERSION_ERROR =
    'Invalid Node.js version format. Valid formats: numeric (e.g., 18, 20), ' +
    'semantic version (e.g., 18.20.0), or keywords (auto, current).';

/**
 * Validates Node.js version parameter for command execution safety
 *
 * Prevents command injection attacks in CommandExecutor when using nodeVersion
 * parameter with fnm (Fast Node Manager). The nodeVersion is interpolated into
 * shell commands like: `fnm exec --using=${nodeVersion} ${command}`
 *
 * SECURITY: HIGH severity (CWE-77: Command Injection)
 * - Attack Vector: Unvalidated nodeVersion directly interpolated into shell command
 * - Example Attack: nodeVersion = "20; rm -rf /" results in: `fnm exec --using=20; rm -rf / npm install`
 * - Protection: Allowlist-based validation blocks ALL shell metacharacters
 *
 * Valid Formats:
 * - Numeric major versions: "18", "20", "22"
 * - Semantic versions: "18.20.0", "20.11.0"
 * - Keywords: "auto", "current"
 * - null/undefined (skip validation)
 *
 * @param nodeVersion - Node.js version string to validate (or null/undefined to skip)
 * @throws Error if nodeVersion contains invalid characters or format
 *
 * @example
 * validateNodeVersion('20');          // OK - numeric major version
 * validateNodeVersion('18.20.0');     // OK - semantic version
 * validateNodeVersion('auto');        // OK - keyword
 * validateNodeVersion(null);          // OK - skip validation
 * validateNodeVersion('20; rm -rf /'); // Throws - command injection attempt
 */
export function validateNodeVersion(nodeVersion: string | null | undefined): void {
    // Allow null/undefined (skip validation when nodeVersion not specified)
    if (nodeVersion === null || nodeVersion === undefined) {
        return;
    }

    // Type check: must be a string if provided
    if (typeof nodeVersion !== 'string') {
        throw new Error(INVALID_NODE_VERSION_ERROR);
    }

    // Allowlist-based validation: only accept specific patterns
    // ^ and $ anchors ensure no additional characters before/after
    const validPattern = /^(?:\d+|\d+\.\d+\.\d+|auto|current)$/;

    if (!validPattern.test(nodeVersion)) {
        throw new Error(INVALID_NODE_VERSION_ERROR);
    }
}
