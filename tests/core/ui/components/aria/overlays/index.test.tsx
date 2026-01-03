/**
 * Overlays Barrel Export Tests
 *
 * Tests that all overlay components are properly exported from the barrel file.
 */

import '@testing-library/jest-dom';
import {
    Dialog,
    DialogTrigger,
    Menu,
    MenuItem,
    MenuSeparator,
    MenuTrigger,
} from '@/core/ui/components/aria/overlays';

describe('overlays barrel export', () => {
    it('should export all overlay components', () => {
        // Then: All components are defined and are functions/objects
        expect(Dialog).toBeDefined();
        expect(typeof Dialog).toBe('function');

        expect(DialogTrigger).toBeDefined();
        expect(typeof DialogTrigger).toBe('function');

        expect(Menu).toBeDefined();
        expect(typeof Menu).toBe('function');

        expect(MenuItem).toBeDefined();
        expect(typeof MenuItem).toBe('object'); // forwardRef returns object

        expect(MenuSeparator).toBeDefined();
        expect(typeof MenuSeparator).toBe('function');

        expect(MenuTrigger).toBeDefined();
        expect(typeof MenuTrigger).toBe('function');
    });
});
