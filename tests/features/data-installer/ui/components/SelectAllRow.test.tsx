/**
 * Select all over a datapack form's boxes: a checkbox that shows the list's state (owner, 2026-11-02).
 * A link that swapped its words did not, and neither did the grey button and the icon before it.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SelectAllRow } from '@/features/data-installer/ui/components/SelectAllRow';

const box = () => screen.getByRole('checkbox', { name: 'Select All' });

describe('SelectAllRow', () => {
    it('is empty when nothing is ticked, and says when it is pressed', () => {
        const onToggle = jest.fn();
        render(<SelectAllRow all={false} some={false} onToggle={onToggle} />);

        expect(box()).not.toBeChecked();
        expect(box()).not.toBePartiallyChecked();

        box().click();
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('shows a dash when some are ticked', () => {
        render(<SelectAllRow all={false} some onToggle={jest.fn()} />);

        expect(box()).toBePartiallyChecked();
    });

    it('is ticked when all are, under the same words', () => {
        render(<SelectAllRow all some onToggle={jest.fn()} />);

        expect(box()).toBeChecked();
        expect(box()).not.toBePartiallyChecked();
    });
});
