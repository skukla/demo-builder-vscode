/**
 * Forms Barrel Export Tests
 *
 * Tests that all form components are properly exported from the barrel file.
 */

import '@testing-library/jest-dom';
import {
    TextField,
    SearchField,
    Checkbox,
    Select,
    SelectItem,
    ProgressBar,
} from '@/core/ui/components/aria/forms';

describe('forms barrel export', () => {
    it('should export all form components', () => {
        // Then: All components are defined and are functions
        expect(TextField).toBeDefined();
        expect(typeof TextField).toBe('object'); // forwardRef returns object

        expect(SearchField).toBeDefined();
        expect(typeof SearchField).toBe('object');

        expect(Checkbox).toBeDefined();
        expect(typeof Checkbox).toBe('object');

        expect(Select).toBeDefined();
        expect(typeof Select).toBe('object');

        expect(SelectItem).toBeDefined();
        // SelectItem may be re-exported from react-aria-components

        expect(ProgressBar).toBeDefined();
        expect(typeof ProgressBar).toBe('object');
    });
});
