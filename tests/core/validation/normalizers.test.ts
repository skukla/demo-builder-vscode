/**
 * Tests for name normalization utilities
 */

import {
    normalizeProjectName,
    normalizeRepositoryName,
    isValidRepositoryName,
    getRepositoryNameError,
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
