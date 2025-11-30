/**
 * Unit tests for formatters
 * Tests string formatting utilities for project creation
 */

import { formatGroupName } from '@/features/project-creation/helpers/formatters';

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
});
