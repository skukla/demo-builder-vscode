/**
 * Tests for name normalization utilities
 */

import {
    normalizeProjectName,
    normalizeRepositoryName,
    isValidRepositoryName,
    getRepositoryNameError,
    getProjectNameError,
} from '@/core/validation/normalizers';

describe('normalizeProjectName', () => {
    it('should convert to lowercase', () => {
        expect(normalizeProjectName('MyProject')).toBe('myproject');
        expect(normalizeProjectName('DEMO')).toBe('demo');
    });

    it('should convert spaces to hyphens', () => {
        expect(normalizeProjectName('My Project')).toBe('my-project');
        expect(normalizeProjectName('Demo Test Name')).toBe('demo-test-name');
    });

    it('should convert underscores to hyphens', () => {
        expect(normalizeProjectName('my_project')).toBe('my-project');
        expect(normalizeProjectName('demo_test_name')).toBe('demo-test-name');
    });

    it('should remove special characters', () => {
        expect(normalizeProjectName('demo!project')).toBe('demoproject');
        expect(normalizeProjectName('test@name#123')).toBe('testname123');
    });

    it('should collapse multiple hyphens', () => {
        expect(normalizeProjectName('demo--project')).toBe('demo-project');
        expect(normalizeProjectName('test---name')).toBe('test-name');
    });

    it('should trim leading hyphens', () => {
        expect(normalizeProjectName('-demo')).toBe('demo');
        expect(normalizeProjectName('--test')).toBe('test');
    });

    it('should preserve trailing hyphens for typing flow', () => {
        expect(normalizeProjectName('demo-')).toBe('demo-');
    });

    it('should strip a WHOLE leading non-letter run, not just one character', () => {
        // Leading hyphens collapse to one before this step, so they cannot show
        // whether the strip is greedy. A leading number can.
        expect(normalizeProjectName('2024 Project')).toBe('project');
        expect(normalizeProjectName('123abc')).toBe('abc');
    });

    it('should handle complex transformations', () => {
        expect(normalizeProjectName('My Demo Project!')).toBe('my-demo-project');
        expect(normalizeProjectName('Test_Demo--Name')).toBe('test-demo-name');
    });
});

describe('normalizeRepositoryName', () => {
    it('should convert to lowercase', () => {
        expect(normalizeRepositoryName('MyRepo')).toBe('myrepo');
        expect(normalizeRepositoryName('DEMO')).toBe('demo');
    });

    it('should convert spaces to hyphens', () => {
        expect(normalizeRepositoryName('My Repo')).toBe('my-repo');
    });

    it('should convert underscores to hyphens', () => {
        expect(normalizeRepositoryName('my_repo')).toBe('my-repo');
    });

    it('should preserve dots (GitHub supports them)', () => {
        expect(normalizeRepositoryName('demo.js')).toBe('demo.js');
        expect(normalizeRepositoryName('test.project.v2')).toBe('test.project.v2');
    });

    it('should remove special characters except dots and hyphens', () => {
        expect(normalizeRepositoryName('demo!repo')).toBe('demorepo');
        expect(normalizeRepositoryName('test@name.js')).toBe('testname.js');
    });

    it('should trim leading non-alphanumeric characters', () => {
        expect(normalizeRepositoryName('-demo')).toBe('demo');
        expect(normalizeRepositoryName('--test')).toBe('test');
        expect(normalizeRepositoryName('.hidden')).toBe('hidden');
    });

    it('should trim a MIXED leading run, not just one character', () => {
        // Dots survive the character filter and do not collapse the way hyphens do,
        // so '.-' is a two-character leading run that must go entirely.
        expect(normalizeRepositoryName('.-demo')).toBe('demo');
        expect(normalizeRepositoryName('..test')).toBe('test');
    });

    it('should handle complex transformations', () => {
        expect(normalizeRepositoryName('My Demo Repo.js')).toBe('my-demo-repo.js');
        expect(normalizeRepositoryName('Test_Demo--Name.v2')).toBe('test-demo-name.v2');
    });
});

describe('isValidRepositoryName', () => {
    it('should return true for valid names', () => {
        expect(isValidRepositoryName('my-repo')).toBe(true);
        expect(isValidRepositoryName('demo123')).toBe(true);
        expect(isValidRepositoryName('test.project')).toBe(true);
        expect(isValidRepositoryName('my_repo')).toBe(true);
        expect(isValidRepositoryName('a')).toBe(true);
        expect(isValidRepositoryName('1repo')).toBe(true);
    });

    it('should return false for names starting with non-alphanumeric', () => {
        expect(isValidRepositoryName('-demo')).toBe(false);
        expect(isValidRepositoryName('_test')).toBe(false);
        expect(isValidRepositoryName('.hidden')).toBe(false);
    });

    it('should return false for names with invalid characters', () => {
        expect(isValidRepositoryName('demo/repo')).toBe(false);
        expect(isValidRepositoryName('test@name')).toBe(false);
        expect(isValidRepositoryName('repo name')).toBe(false);
    });

    it('should return false for empty strings', () => {
        expect(isValidRepositoryName('')).toBe(false);
    });

    it('should return false for a missing name rather than testing its spelling', () => {
        // Without the falsy guard, RegExp.test coerces its argument, so undefined
        // would be matched as the literal text 'undefined' — a perfectly valid repo
        // name — and a blank field would read as filled in.
        expect(isValidRepositoryName(undefined as unknown as string)).toBe(false);
        expect(isValidRepositoryName(null as unknown as string)).toBe(false);
    });
});

describe('getRepositoryNameError', () => {
    it('should return undefined for valid names', () => {
        expect(getRepositoryNameError('my-repo')).toBeUndefined();
        expect(getRepositoryNameError('demo.js')).toBeUndefined();
        expect(getRepositoryNameError('test_123')).toBeUndefined();
    });

    it('should return error for empty names', () => {
        expect(getRepositoryNameError('')).toBe('Repository name is required');
    });

    it('should return error for invalid names', () => {
        const error = getRepositoryNameError('-invalid');
        expect(error).toContain('must start with a letter or number');
    });
});

describe('getProjectNameError', () => {
    const REQUIRED = 'Project name is required';
    const PATTERN =
        'Must start with a letter and contain only lowercase letters, numbers, and hyphens';
    const TOO_SHORT = 'Name must be at least 3 characters';
    const TOO_LONG = 'Name must be less than 30 characters';
    const DUPLICATE = 'A project with this name already exists';

    it('should accept a well-formed name', () => {
        expect(getProjectNameError('my-project')).toBeUndefined();
        expect(getProjectNameError('demo123')).toBeUndefined();
    });

    // Each check reports its OWN message, so the assertions below are on the exact
    // string: that is what says which check fired, and a name can fail several.
    it('should report a missing or blank name as required', () => {
        expect(getProjectNameError('')).toBe(REQUIRED);
        expect(getProjectNameError('   ')).toBe(REQUIRED);
        expect(getProjectNameError(undefined as unknown as string)).toBe(REQUIRED);
    });

    it('should trim before validating', () => {
        expect(getProjectNameError('  my-project  ')).toBeUndefined();
    });

    it('should reject anything the pattern does not allow', () => {
        expect(getProjectNameError('My-Project')).toBe(PATTERN);
        expect(getProjectNameError('1project')).toBe(PATTERN);
        expect(getProjectNameError('my_project')).toBe(PATTERN);
        expect(getProjectNameError('my project')).toBe(PATTERN);
        expect(getProjectNameError('my-project!')).toBe(PATTERN);
    });

    it('should enforce the minimum length at its boundary', () => {
        expect(getProjectNameError('ab')).toBe(TOO_SHORT);
        expect(getProjectNameError('abc')).toBeUndefined();
    });

    it('should enforce the maximum length at its boundary', () => {
        expect(getProjectNameError('a'.repeat(30))).toBeUndefined();
        expect(getProjectNameError('a'.repeat(31))).toBe(TOO_LONG);
    });

    it('should reject a name another project already has', () => {
        expect(getProjectNameError('my-project', ['my-project'])).toBe(DUPLICATE);
        expect(getProjectNameError('my-project', ['other-project'])).toBeUndefined();
    });

    it('should let a rename keep its own current name', () => {
        // allowedName is the project being renamed: its own name is in existingNames
        // and must not count against it, while every other taken name still does.
        expect(getProjectNameError('my-project', ['my-project'], 'my-project')).toBeUndefined();
        expect(
            getProjectNameError('other-project', ['my-project', 'other-project'], 'my-project')
        ).toBe(DUPLICATE);
    });
});
