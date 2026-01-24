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
 * Normalize identifier name for valid format (projects, sites, etc.).
 *
 * Transforms user input to valid identifier:
 * - Converts to lowercase
 * - Converts spaces and underscores to hyphens
 * - Removes special characters (keeps only a-z, 0-9, hyphens)
 * - Collapses multiple consecutive hyphens to single hyphen
 * - Ensures name starts with a letter (strips leading non-alpha characters)
 *
 * Used for project names, DA.live site names, and other identifiers
 * that must start with a letter for consistency and portability.
 *
 * @example
 * normalizeIdentifierName('My Project') // returns 'my-project'
 * normalizeIdentifierName('Test_Demo') // returns 'test-demo'
 * normalizeIdentifierName('2024 Project') // returns 'project'
 * normalizeIdentifierName('--Hello') // returns 'hello'
 */
export function normalizeIdentifierName(input: string): string {
    return input
        .toLowerCase()
        .replace(/[\s_]+/g, '-')       // Convert spaces and underscores to hyphens
        .replace(/[^a-z0-9-]/g, '')    // Remove special characters
        .replace(/-+/g, '-')           // Collapse multiple hyphens
        .replace(/^[^a-z]+/, '');      // MUST start with letter (strip leading non-alpha)
}

/**
 * Normalize project name for valid directory/identifier format.
 *
 * Transforms user input to valid project name:
 * - Converts to lowercase
 * - Converts spaces and underscores to hyphens
 * - Removes special characters (keeps only a-z, 0-9, hyphens)
 * - Collapses multiple consecutive hyphens to single hyphen
 * - Ensures name starts with a letter
 *
 * @example
 * normalizeProjectName('My Project') // returns 'my-project'
 * normalizeProjectName('Test_Demo') // returns 'test-demo'
 * normalizeProjectName('Hello World!') // returns 'hello-world'
 * normalizeProjectName('Demo--Name') // returns 'demo-name'
 */
export function normalizeProjectName(input: string): string {
    return normalizeIdentifierName(input);
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

/**
 * Project name validation pattern.
 * - Must start with a lowercase letter
 * - Can contain lowercase letters, numbers, and hyphens
 */
const PROJECT_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Validate a project name and return an error message if invalid.
 *
 * Validates:
 * - Required (not empty)
 * - Pattern (starts with letter, lowercase letters/numbers/hyphens only)
 * - Min length (3 characters)
 * - Max length (30 characters)
 * - Uniqueness (not in existingNames, unless it matches allowedName)
 *
 * @param name - The project name to validate
 * @param existingNames - Array of existing project names to check for duplicates
 * @param allowedName - Optional name that's allowed even if in existingNames (for edit/rename)
 * @returns Error message string, or undefined if valid
 *
 * @example
 * // New project validation
 * getProjectNameError('my-project', ['other-project']); // undefined (valid)
 * getProjectNameError('my-project', ['my-project']); // 'A project with this name already exists'
 *
 * // Rename validation (allow keeping current name)
 * getProjectNameError('my-project', ['my-project'], 'my-project'); // undefined (valid - same name)
 * getProjectNameError('other-project', ['my-project', 'other-project'], 'my-project'); // 'A project with this name already exists'
 */
export function getProjectNameError(
    name: string,
    existingNames: string[] = [],
    allowedName?: string,
): string | undefined {
    // Required check
    if (!name || name.trim() === '') {
        return 'Project name is required';
    }

    const trimmedName = name.trim();

    // Pattern check (must start with letter, lowercase only)
    if (!PROJECT_NAME_PATTERN.test(trimmedName)) {
        return 'Must start with a letter and contain only lowercase letters, numbers, and hyphens';
    }

    // Min length check
    if (trimmedName.length < 3) {
        return 'Name must be at least 3 characters';
    }

    // Max length check
    if (trimmedName.length > 30) {
        return 'Name must be less than 30 characters';
    }

    // Uniqueness check (allow the current name in edit/rename mode)
    if (trimmedName !== allowedName && existingNames.includes(trimmedName)) {
        return 'A project with this name already exists';
    }

    return undefined;
}

/**
 * Check if a project name is valid.
 *
 * @param name - The project name to validate
 * @param existingNames - Array of existing project names to check for duplicates
 * @param allowedName - Optional name that's allowed even if in existingNames
 * @returns true if the name is valid
 */
export function isValidProjectName(
    name: string,
    existingNames: string[] = [],
    allowedName?: string,
): boolean {
    return getProjectNameError(name, existingNames, allowedName) === undefined;
}

