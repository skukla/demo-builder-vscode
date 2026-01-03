/**
 * Primitives Barrel Export Tests
 *
 * Tests that all primitive components are properly exported from the barrel file.
 */

import '@testing-library/jest-dom';
import * as Primitives from '@/core/ui/components/aria/primitives';

describe('primitives barrel exports', () => {
    it('should export all primitives from barrel (Text, Heading, Flex, View, Divider)', () => {
        // Given: Import all exports from primitives index
        // When: Checking exports
        // Then: All expected components are exported

        expect(Primitives.Text).toBeDefined();
        expect(Primitives.Heading).toBeDefined();
        expect(Primitives.Flex).toBeDefined();
        expect(Primitives.View).toBeDefined();
        expect(Primitives.Divider).toBeDefined();
    });

    it('should export Text as a forwardRef component', () => {
        expect(Primitives.Text).toHaveProperty('$$typeof');
        expect(Primitives.Text.displayName).toBe('Text');
    });

    it('should export Heading as a forwardRef component', () => {
        expect(Primitives.Heading).toHaveProperty('$$typeof');
        expect(Primitives.Heading.displayName).toBe('Heading');
    });

    it('should export Flex as a forwardRef component', () => {
        expect(Primitives.Flex).toHaveProperty('$$typeof');
        expect(Primitives.Flex.displayName).toBe('Flex');
    });

    it('should export View as a forwardRef component', () => {
        expect(Primitives.View).toHaveProperty('$$typeof');
        expect(Primitives.View.displayName).toBe('View');
    });

    it('should export Divider as a forwardRef component', () => {
        expect(Primitives.Divider).toHaveProperty('$$typeof');
        expect(Primitives.Divider.displayName).toBe('Divider');
    });
});
