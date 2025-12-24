/**
 * Name Normalization Utilities
 *
 * Functions for normalizing and validating project and repository names.
 * These ensure consistent, safe naming across the extension.
 */

/**
 * GitHub repository name validation pattern.
 * - Must start with a letter or number
 * - Can contain letters, numbers, dots, hyphens, and underscores
 */
const REPO_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * Normalize project name for valid directory/identifier format.
 *
 * Transforms user input to valid project name:
 * - Converts to lowercase
 * - Converts spaces and underscores to hyphens
 * - Removes special characters (keeps only a-z, 0-9, hyphens)
 * - Collapses multiple consecutive hyphens to single hyphen
 * - Trims leading hyphens only (preserves trailing for typing flow)
 *
 * @example
 * normalizeProjectName('My Project') // returns 'my-project'
 * normalizeProjectName('Test_Demo') // returns 'test-demo'
 * normalizeProjectName('Hello World!') // returns 'hello-world'
 * normalizeProjectName('Demo--Name') // returns 'demo-name'
 */
export function normalizeProjectName(input: string): string {
    return input
        .toLowerCase()
        .replace(/[\s_]+/g, '-')      // Convert spaces and underscores to hyphens
        .replace(/[^a-z0-9-]/g, '')   // Remove special characters
        .replace(/-+/g, '-')          // Collapse multiple hyphens
        .replace(/^-/, '');           // Trim leading hyphen only (preserve trailing for typing)
}

/**
 * Normalize repository name for GitHub compatibility.
 *
 * Similar to project name normalization but allows dots (GitHub supports them).
 * - Converts to lowercase
 * - Converts spaces and underscores to hyphens
 * - Removes special characters (keeps a-z, 0-9, hyphens, dots)
 * - Collapses multiple consecutive hyphens to single hyphen
 * - Trims leading hyphens only
 * - Ensures name starts with alphanumeric character
 *
 * @example
 * normalizeRepositoryName('My Repo') // returns 'my-repo'
 * normalizeRepositoryName('Test_Demo.js') // returns 'test-demo.js'
 * normalizeRepositoryName('Hello World!') // returns 'hello-world'
 * normalizeRepositoryName('--invalid') // returns 'invalid'
 */
export function normalizeRepositoryName(input: string): string {
    return input
        .toLowerCase()
        .replace(/[\s_]+/g, '-')       // Convert spaces and underscores to hyphens
        .replace(/[^a-z0-9.-]/g, '')   // Remove special chars (keep dots for GitHub)
        .replace(/-+/g, '-')           // Collapse multiple hyphens
        .replace(/^[^a-z0-9]+/, '');   // Trim leading non-alphanumeric chars
}

/**
 * Validate repository name format for GitHub.
 *
 * GitHub repository names must:
 * - Start with a letter or number
 * - Contain only letters, numbers, hyphens, underscores, or periods
 *
 * @example
 * isValidRepositoryName('my-repo') // true
 * isValidRepositoryName('test.project_123') // true
 * isValidRepositoryName('-invalid') // false
 * isValidRepositoryName('bad/name') // false
 */
export function isValidRepositoryName(name: string): boolean {
    if (!name) return false;
    return REPO_NAME_PATTERN.test(name);
}

/**
 * Get validation error message for invalid repository name.
 * Returns undefined if the name is valid.
 *
 * @example
 * getRepositoryNameError('-invalid')
 * // returns 'Repository name must start with a letter or number and contain only letters, numbers, hyphens, underscores, or periods'
 *
 * getRepositoryNameError('valid-name')
 * // returns undefined
 */
export function getRepositoryNameError(name: string): string | undefined {
    if (!name) return 'Repository name is required';
    if (!REPO_NAME_PATTERN.test(name)) {
        return 'Repository name must start with a letter or number and contain only letters, numbers, hyphens, underscores, or periods';
    }
    return undefined;
}
