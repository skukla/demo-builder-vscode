/**
 * Security Validation Tests - Input Validation
 *
 * Tests for input validation and command injection prevention:
 * - Adobe resource ID validation (org, project, workspace, mesh)
 * - Project name security validation
 * - Path traversal prevention
 * - Command injection protection
 *
 * Target Coverage: 90%+
 */

import * as path from 'path';
import * as os from 'os';
import {
    validateAdobeResourceId,
    validateProjectNameSecurity,
    validateProjectPath,
    validateOrgId,
    validateProjectId,
    validateWorkspaceId,
    validateMeshId
} from '@/core/validation';

describe('securityValidation - Input Validation', () => {

    // =================================================================
    // validateAdobeResourceId Tests
    // =================================================================

    describe('validateAdobeResourceId', () => {
        describe('valid inputs', () => {
            it('should accept valid alphanumeric IDs', () => {
                expect(() => validateAdobeResourceId('abc123', 'test')).not.toThrow();
                expect(() => validateAdobeResourceId('12345', 'test')).not.toThrow();
                expect(() => validateAdobeResourceId('abcdef', 'test')).not.toThrow();
            });

            it('should accept IDs with hyphens', () => {
                expect(() => validateAdobeResourceId('abc-123', 'test')).not.toThrow();
                expect(() => validateAdobeResourceId('my-project-id', 'test')).not.toThrow();
            });

            it('should accept IDs with underscores', () => {
                expect(() => validateAdobeResourceId('abc_123', 'test')).not.toThrow();
                expect(() => validateAdobeResourceId('my_project_id', 'test')).not.toThrow();
            });

            it('should accept mixed alphanumeric with hyphens and underscores', () => {
                expect(() => validateAdobeResourceId('proj-123_abc', 'test')).not.toThrow();
                expect(() => validateAdobeResourceId('test_ID-2024', 'test')).not.toThrow();
            });

            it('should accept typical Adobe resource ID formats', () => {
                expect(() => validateAdobeResourceId('1234567890abcdef12345678', 'project ID')).not.toThrow();
                // Note: @ is NOT allowed - only alphanumeric, hyphens, underscores
            });
        });

        describe('command injection attacks', () => {
            it('should reject shell metacharacters - semicolon', () => {
                expect(() => validateAdobeResourceId('abc; rm -rf /', 'test'))
                    .toThrow(/illegal characters/);
            });

            it('should reject shell metacharacters - pipe', () => {
                expect(() => validateAdobeResourceId('abc | cat /etc/passwd', 'test'))
                    .toThrow(/illegal characters/);
            });

            it('should reject shell metacharacters - ampersand', () => {
                expect(() => validateAdobeResourceId('abc && whoami', 'test'))
                    .toThrow(/illegal characters/);
            });

            it('should reject shell metacharacters - backticks', () => {
                expect(() => validateAdobeResourceId('abc`whoami`', 'test'))
                    .toThrow(/illegal characters/);
            });

            it('should reject shell metacharacters - dollar sign', () => {
                expect(() => validateAdobeResourceId('abc$(whoami)', 'test'))
                    .toThrow(/illegal characters/);
                expect(() => validateAdobeResourceId('${PATH}', 'test'))
                    .toThrow(/illegal characters/);
            });

            it('should reject shell metacharacters - redirection', () => {
                expect(() => validateAdobeResourceId('abc > /tmp/file', 'test'))
                    .toThrow(/illegal characters/);
                expect(() => validateAdobeResourceId('abc < /etc/passwd', 'test'))
                    .toThrow(/illegal characters/);
            });

            it('should reject shell metacharacters - parentheses', () => {
                expect(() => validateAdobeResourceId('abc(test)', 'test'))
                    .toThrow(/illegal characters/);
            });

            it('should reject quotes', () => {
                expect(() => validateAdobeResourceId('abc"test"', 'test'))
                    .toThrow(/illegal characters/);
                expect(() => validateAdobeResourceId("abc'test'", 'test'))
                    .toThrow(/illegal characters/);
            });

            it('should reject backslashes', () => {
                expect(() => validateAdobeResourceId('abc\\test', 'test'))
                    .toThrow(/illegal characters/);
            });
        });

        describe('edge cases', () => {
            it('should reject empty strings', () => {
                expect(() => validateAdobeResourceId('', 'test'))
                    .toThrow(/must be a non-empty string/);
            });

            it('should reject whitespace-only strings', () => {
                expect(() => validateAdobeResourceId('   ', 'test'))
                    .toThrow(/illegal characters/);
            });

            it('should reject IDs with spaces', () => {
                expect(() => validateAdobeResourceId('abc 123', 'test'))
                    .toThrow(/illegal characters/);
            });

            it('should reject null/undefined', () => {
                expect(() => validateAdobeResourceId(null as any, 'test'))
                    .toThrow(/must be a non-empty string/);
                expect(() => validateAdobeResourceId(undefined as any, 'test'))
                    .toThrow(/must be a non-empty string/);
            });

            it('should reject non-string values', () => {
                expect(() => validateAdobeResourceId(123 as any, 'test'))
                    .toThrow(/must be a non-empty string/);
                expect(() => validateAdobeResourceId({} as any, 'test'))
                    .toThrow(/must be a non-empty string/);
            });

            it('should reject IDs exceeding 100 characters', () => {
                const longId = 'a'.repeat(101);
                expect(() => validateAdobeResourceId(longId, 'test'))
                    .toThrow(/too long/);
            });

            it('should accept IDs at exactly 100 characters', () => {
                const maxId = 'a'.repeat(100);
                expect(() => validateAdobeResourceId(maxId, 'test')).not.toThrow();
            });
        });

        describe('special characters', () => {
            it('should reject special characters', () => {
                expect(() => validateAdobeResourceId('abc@test', 'test'))
                    .toThrow(/illegal characters/);
                expect(() => validateAdobeResourceId('abc#test', 'test'))
                    .toThrow(/illegal characters/);
                expect(() => validateAdobeResourceId('abc%test', 'test'))
                    .toThrow(/illegal characters/);
                expect(() => validateAdobeResourceId('abc&test', 'test'))
                    .toThrow(/illegal characters/);
                expect(() => validateAdobeResourceId('abc*test', 'test'))
                    .toThrow(/illegal characters/);
            });

            it('should reject dots and slashes', () => {
                expect(() => validateAdobeResourceId('abc.test', 'test'))
                    .toThrow(/illegal characters/);
                expect(() => validateAdobeResourceId('abc/test', 'test'))
                    .toThrow(/illegal characters/);
            });
        });
    });

    // =================================================================
    // Convenience wrapper tests
    // =================================================================

    describe('validateOrgId', () => {
        it('should validate organization IDs', () => {
            expect(() => validateOrgId('valid-org-id')).not.toThrow();
        });

        it('should reject invalid organization IDs', () => {
            expect(() => validateOrgId('invalid; org'))
                .toThrow(/organization ID.*illegal characters/);
        });
    });

    describe('validateProjectId', () => {
        it('should validate project IDs', () => {
            expect(() => validateProjectId('valid-project-id')).not.toThrow();
        });

        it('should reject invalid project IDs', () => {
            expect(() => validateProjectId('invalid$(whoami)'))
                .toThrow(/project ID.*illegal characters/);
        });
    });

    describe('validateWorkspaceId', () => {
        it('should validate workspace IDs', () => {
            expect(() => validateWorkspaceId('valid-workspace-id')).not.toThrow();
        });

        it('should reject invalid workspace IDs', () => {
            expect(() => validateWorkspaceId('invalid | cat'))
                .toThrow(/workspace ID.*illegal characters/);
        });
    });

    describe('validateMeshId', () => {
        it('should validate mesh IDs', () => {
            expect(() => validateMeshId('valid-mesh-id')).not.toThrow();
            expect(() => validateMeshId('my-mesh-123')).not.toThrow();
        });

        it('should reject command injection in mesh IDs', () => {
            expect(() => validateMeshId('abc; rm -rf /'))
                .toThrow(/mesh ID.*illegal characters/);
        });
    });

    // =================================================================
    // validateProjectNameSecurity Tests
    // =================================================================

    describe('validateProjectNameSecurity', () => {
        describe('valid inputs', () => {
            it('should accept valid project names', () => {
                expect(() => validateProjectNameSecurity('my-demo-project')).not.toThrow();
                expect(() => validateProjectNameSecurity('project_123')).not.toThrow();
                expect(() => validateProjectNameSecurity('test-proj-2024')).not.toThrow();
            });

            it('should accept alphanumeric names', () => {
                expect(() => validateProjectNameSecurity('abc123')).not.toThrow();
                expect(() => validateProjectNameSecurity('PROJECT2024')).not.toThrow();
            });
        });

        describe('path traversal attacks', () => {
            it('should reject parent directory references', () => {
                expect(() => validateProjectNameSecurity('../etc/passwd'))
                    .toThrow(/path separators/);
                expect(() => validateProjectNameSecurity('..'))
                    .toThrow(/path separators/);
                expect(() => validateProjectNameSecurity('abc..def'))
                    .toThrow(/path separators/);
            });

            it('should reject forward slashes', () => {
                expect(() => validateProjectNameSecurity('abc/def'))
                    .toThrow(/path separators/);
                expect(() => validateProjectNameSecurity('/etc/passwd'))
                    .toThrow(/path separators/);
            });

            it('should reject backslashes', () => {
                expect(() => validateProjectNameSecurity('abc\\def'))
                    .toThrow(/path separators/);
                expect(() => validateProjectNameSecurity('C:\\Windows'))
                    .toThrow(/path separators/);
            });
        });

        describe('command injection attacks', () => {
            it('should reject semicolons', () => {
                expect(() => validateProjectNameSecurity('proj; rm -rf /'))
                    .toThrow(/path separators/);
            });

            it('should reject pipes', () => {
                // This contains "/" so it gets caught by path separator check
                expect(() => validateProjectNameSecurity('proj | cat /etc/passwd'))
                    .toThrow(/path separators/);
            });

            it('should reject shell metacharacters', () => {
                expect(() => validateProjectNameSecurity('proj$(whoami)'))
                    .toThrow(/can only contain letters/);
                expect(() => validateProjectNameSecurity('proj`whoami`'))
                    .toThrow(/can only contain letters/);
            });
        });

        describe('reserved names', () => {
            it('should reject Windows reserved names', () => {
                expect(() => validateProjectNameSecurity('con'))
                    .toThrow(/reserved system name/);
                expect(() => validateProjectNameSecurity('CON'))
                    .toThrow(/reserved system name/);
                expect(() => validateProjectNameSecurity('prn'))
                    .toThrow(/reserved system name/);
                expect(() => validateProjectNameSecurity('aux'))
                    .toThrow(/reserved system name/);
                expect(() => validateProjectNameSecurity('nul'))
                    .toThrow(/reserved system name/);
            });

            it('should reject COM ports', () => {
                expect(() => validateProjectNameSecurity('com1'))
                    .toThrow(/reserved system name/);
                expect(() => validateProjectNameSecurity('COM9'))
                    .toThrow(/reserved system name/);
            });

            it('should reject LPT ports', () => {
                expect(() => validateProjectNameSecurity('lpt1'))
                    .toThrow(/reserved system name/);
                expect(() => validateProjectNameSecurity('LPT9'))
                    .toThrow(/reserved system name/);
            });
        });

        describe('edge cases', () => {
            it('should reject empty strings', () => {
                expect(() => validateProjectNameSecurity(''))
                    .toThrow(/must be a non-empty string/);
            });

            it('should reject null/undefined', () => {
                expect(() => validateProjectNameSecurity(null as any))
                    .toThrow(/must be a non-empty string/);
                expect(() => validateProjectNameSecurity(undefined as any))
                    .toThrow(/must be a non-empty string/);
            });

            it('should reject names exceeding 100 characters', () => {
                const longName = 'a'.repeat(101);
                expect(() => validateProjectNameSecurity(longName))
                    .toThrow(/less than 100 characters/);
            });

            it('should accept names at exactly 100 characters', () => {
                const maxName = 'a'.repeat(100);
                expect(() => validateProjectNameSecurity(maxName)).not.toThrow();
            });

            it('should reject special characters', () => {
                expect(() => validateProjectNameSecurity('project@test'))
                    .toThrow(/can only contain letters/);
                expect(() => validateProjectNameSecurity('project#1'))
                    .toThrow(/can only contain letters/);
                expect(() => validateProjectNameSecurity('project!'))
                    .toThrow(/can only contain letters/);
            });
        });
    });

    // =================================================================
    // validateProjectPath Tests
    // =================================================================

    describe('validateProjectPath', () => {
        const allowedBase = path.join(os.homedir(), '.demo-builder', 'projects');

        describe('valid paths', () => {
            it('should accept paths within allowed base', () => {
                const validPath = path.join(allowedBase, 'my-project');
                expect(() => validateProjectPath(validPath)).not.toThrow();
            });

            it('should accept deeply nested paths', () => {
                const validPath = path.join(allowedBase, 'folder1', 'folder2', 'project');
                expect(() => validateProjectPath(validPath)).not.toThrow();
            });
        });

        describe('path traversal attacks', () => {
            it('should reject paths with parent directory references', () => {
                const maliciousPath = path.join(allowedBase, '..', '..', '..', 'etc', 'passwd');
                expect(() => validateProjectPath(maliciousPath))
                    .toThrow(/outside demo-builder projects directory/);
            });

            it('should reject absolute paths outside allowed base', () => {
                expect(() => validateProjectPath('/etc/passwd'))
                    .toThrow(/outside demo-builder projects directory/);
                expect(() => validateProjectPath('/tmp/malicious'))
                    .toThrow(/outside demo-builder projects directory/);
            });

            it('should reject relative path traversal', () => {
                const maliciousPath = path.join(allowedBase, 'project', '..', '..', '..', 'etc');
                expect(() => validateProjectPath(maliciousPath))
                    .toThrow(/outside demo-builder projects directory/);
            });

            it('should handle normalized paths correctly', () => {
                // Path that looks safe but normalizes to escape
                const sneakyPath = path.join(allowedBase, 'project/../../../etc/passwd');
                expect(() => validateProjectPath(sneakyPath))
                    .toThrow(/outside demo-builder projects directory/);
            });
        });

        describe('edge cases', () => {
            it('should reject empty strings', () => {
                expect(() => validateProjectPath(''))
                    .toThrow(/must be a non-empty string/);
            });

            it('should reject null/undefined', () => {
                expect(() => validateProjectPath(null as any))
                    .toThrow(/must be a non-empty string/);
                expect(() => validateProjectPath(undefined as any))
                    .toThrow(/must be a non-empty string/);
            });

            it('should accept the allowed base directory itself', () => {
                expect(() => validateProjectPath(allowedBase)).not.toThrow();
            });
        });

        describe('platform-specific paths', () => {
            if (process.platform === 'win32') {
                it('should handle Windows paths', () => {
                    const winPath = 'C:\\Users\\test\\.demo-builder\\projects\\myproject';
                    // This will fail since it's not in the homedir, but testing the logic
                    expect(() => validateProjectPath(winPath))
                        .toThrow(/outside demo-builder projects directory/);
                });
            } else {
                it('should handle Unix paths', () => {
                    const unixPath = '/home/user/.demo-builder/projects/myproject';
                    // This will fail since it's not in the homedir, but testing the logic
                    expect(() => validateProjectPath(unixPath))
                        .toThrow(/outside demo-builder projects directory/);
                });
            }
        });
    });
});
