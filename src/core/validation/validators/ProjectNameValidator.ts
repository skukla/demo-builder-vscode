/**
 * Project Name Validator
 *
 * Validates project names for file system safety, preventing:
 * - Path traversal attacks
 * - Shell injection
 * - Reserved system names
 */

/**
 * Reserved names that cannot be used as project names
 * (Windows reserved device names)
 */
const RESERVED_NAMES = [
    'con', 'prn', 'aux', 'nul',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
];

/**
 * Validates project names for file system safety
 *
 * Project names are used to create directories, so they must not contain
 * path traversal sequences or shell metacharacters.
 *
 * @param name - Project name to validate
 * @throws Error if name is invalid
 *
 * @example
 * validateProjectNameSecurity('my-demo-project'); // OK
 * validateProjectNameSecurity('project_123'); // OK
 * validateProjectNameSecurity('../etc/passwd'); // Throws
 * validateProjectNameSecurity('proj; rm -rf /'); // Throws
 */
export function validateProjectNameSecurity(name: string): void {
    if (!name || typeof name !== 'string') {
        throw new Error('Project name must be a non-empty string');
    }

    // Check length (reasonable project name length)
    if (name.length > 100) {
        throw new Error('Project name must be less than 100 characters');
    }

    // Check for path traversal attempts
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
        throw new Error('Project name cannot contain path separators or parent directory references');
    }

    // Allow only safe characters: alphanumeric, hyphens, underscores
    // This blocks shell metacharacters and special filesystem characters
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        throw new Error('Project name can only contain letters, numbers, hyphens, and underscores');
    }

    // Prevent reserved names
    if (RESERVED_NAMES.includes(name.toLowerCase())) {
        throw new Error(`Project name cannot be a reserved system name: ${name}`);
    }
}
