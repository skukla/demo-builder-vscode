/**
 * Unit tests for formatters
 * Tests string formatting utilities for project creation
 */

import { formatGroupName, normalizeProjectName } from '@/features/project-creation/helpers/formatters';

describe('formatters', () => {
    describe('formatGroupName', () => {
        it('should convert single hyphenated word to title case', () => {
            expect(formatGroupName('api')).toBe('Api');
            expect(formatGroupName('database')).toBe('Database');
            expect(formatGroupName('general')).toBe('General');
        });

        it('should convert multi-word hyphenated names to title case with spaces', () => {
            expect(formatGroupName('api-mesh')).toBe('Api Mesh');
            expect(formatGroupName('commerce-backend')).toBe('Commerce Backend');
            expect(formatGroupName('adobe-commerce')).toBe('Adobe Commerce');
        });

        it('should handle three or more hyphenated words', () => {
            expect(formatGroupName('api-mesh-config')).toBe('Api Mesh Config');
            expect(formatGroupName('my-custom-group-name')).toBe('My Custom Group Name');
        });

        it('should handle single character words', () => {
            expect(formatGroupName('a-b-c')).toBe('A B C');
        });

        it('should handle words with mixed case input', () => {
            expect(formatGroupName('API-mesh')).toBe('API Mesh');
            expect(formatGroupName('Commerce-BACKEND')).toBe('Commerce BACKEND');
        });

        it('should handle empty string', () => {
            expect(formatGroupName('')).toBe('');
        });

        it('should handle names without hyphens', () => {
            expect(formatGroupName('general')).toBe('General');
            expect(formatGroupName('config')).toBe('Config');
        });

        it('should handle consecutive hyphens', () => {
            expect(formatGroupName('api--mesh')).toBe('Api  Mesh');
        });

        it('should handle leading and trailing hyphens', () => {
            expect(formatGroupName('-api-mesh-')).toBe(' Api Mesh ');
        });
    });

    describe('normalizeProjectName', () => {
        it('should convert uppercase to lowercase', () => {
            expect(normalizeProjectName('MyProject')).toBe('myproject');
            expect(normalizeProjectName('DEMO')).toBe('demo');
            expect(normalizeProjectName('Test')).toBe('test');
        });

        it('should convert spaces to hyphens', () => {
            expect(normalizeProjectName('my project')).toBe('my-project');
            expect(normalizeProjectName('hello world demo')).toBe('hello-world-demo');
        });

        it('should convert underscores to hyphens', () => {
            expect(normalizeProjectName('my_project')).toBe('my-project');
            expect(normalizeProjectName('test_demo_name')).toBe('test-demo-name');
        });

        it('should handle mixed spaces and underscores', () => {
            expect(normalizeProjectName('my_project name')).toBe('my-project-name');
            expect(normalizeProjectName('test demo_example')).toBe('test-demo-example');
        });

        it('should remove special characters', () => {
            expect(normalizeProjectName('hello!')).toBe('hello');
            expect(normalizeProjectName('test@demo#name')).toBe('testdemoname');
            expect(normalizeProjectName('project$%^&*()')).toBe('project');
        });

        it('should preserve numbers', () => {
            expect(normalizeProjectName('demo123')).toBe('demo123');
            expect(normalizeProjectName('test2024')).toBe('test2024');
            expect(normalizeProjectName('project-v1')).toBe('project-v1');
        });

        it('should collapse multiple consecutive hyphens', () => {
            expect(normalizeProjectName('demo--name')).toBe('demo-name');
            expect(normalizeProjectName('test---project')).toBe('test-project');
            expect(normalizeProjectName('a----b')).toBe('a-b');
        });

        it('should trim leading hyphens but preserve trailing (for typing flow)', () => {
            expect(normalizeProjectName('-demo')).toBe('demo');
            expect(normalizeProjectName('demo-')).toBe('demo-');
            expect(normalizeProjectName('-demo-')).toBe('demo-');
            expect(normalizeProjectName('--demo--')).toBe('demo-');
        });

        it('should handle complex real-world inputs', () => {
            expect(normalizeProjectName('My Commerce Demo')).toBe('my-commerce-demo');
            expect(normalizeProjectName('Test_Project_2024')).toBe('test-project-2024');
            expect(normalizeProjectName('Hello World!')).toBe('hello-world');
            expect(normalizeProjectName('  spaced  out  ')).toBe('spaced-out-'); // trailing hyphen preserved for typing
        });

        it('should handle empty string', () => {
            expect(normalizeProjectName('')).toBe('');
        });

        it('should handle already valid input', () => {
            expect(normalizeProjectName('my-commerce-demo')).toBe('my-commerce-demo');
            expect(normalizeProjectName('test123')).toBe('test123');
        });
    });
});
