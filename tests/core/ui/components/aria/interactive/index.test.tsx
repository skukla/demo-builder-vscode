/**
 * Interactive Barrel Export Tests
 *
 * Tests that all interactive components are properly exported from the barrel file.
 */

import '@testing-library/jest-dom';
import * as Interactive from '@/core/ui/components/aria/interactive';

describe('interactive barrel exports', () => {
    it('should export all interactive components (Button, ActionButton, ProgressCircle)', () => {
        // Given: Import all exports from interactive index
        // When: Checking exports
        // Then: All expected components are exported

        expect(Interactive.Button).toBeDefined();
        expect(Interactive.ActionButton).toBeDefined();
        expect(Interactive.ProgressCircle).toBeDefined();
    });

    it('should export Button as a forwardRef component', () => {
        expect(Interactive.Button).toHaveProperty('$$typeof');
        expect(Interactive.Button.displayName).toBe('Button');
    });

    it('should export ActionButton as a forwardRef component', () => {
        expect(Interactive.ActionButton).toHaveProperty('$$typeof');
        expect(Interactive.ActionButton.displayName).toBe('ActionButton');
    });

    it('should export ProgressCircle as a forwardRef component', () => {
        expect(Interactive.ProgressCircle).toHaveProperty('$$typeof');
        expect(Interactive.ProgressCircle.displayName).toBe('ProgressCircle');
    });

    it('should export type definitions alongside components', () => {
        // Type exports are verified at compile time
        // This test documents the expected exports
        const exports = Object.keys(Interactive);

        // Should have the three components
        expect(exports).toContain('Button');
        expect(exports).toContain('ActionButton');
        expect(exports).toContain('ProgressCircle');
    });
});
