/**
 * Select all / Clear all over a datapack form's boxes: accent-coloured words beside the list's
 * label. A grey quiet button was reported as hard to see, and the "select box" icon that replaced
 * it is drawn as a ticked checkbox, so it read as "everything is selected" (owner, 2026-10-31).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SelectAllToggle } from '@/features/data-installer/ui/components/SelectAllToggle';

describe('SelectAllToggle', () => {
    it('offers Select all as accent words, with no icon, while some box is unticked', () => {
        const onToggle = jest.fn();
        render(<SelectAllToggle allSelected={false} onToggle={onToggle} />);

        const button = screen.getByRole('button', { name: 'Select all' });
        expect(button).toHaveClass('inline-action-link');
        expect(button.querySelector('svg')).toBeNull();

        button.click();
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('offers Clear all once every box is ticked', () => {
        render(<SelectAllToggle allSelected onToggle={jest.fn()} />);

        expect(screen.getByRole('button', { name: /Clear all/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Select all/ })).not.toBeInTheDocument();
    });
});
