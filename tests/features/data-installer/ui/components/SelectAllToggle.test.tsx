/**
 * Select all / Clear all over a datapack form's boxes, with an icon like the catalog header's
 * buttons: the bare words were reported as hard to see (owner, 2026-10-31).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SelectAllToggle } from '@/features/data-installer/ui/components/SelectAllToggle';

describe('SelectAllToggle', () => {
    it('offers Select all, with an icon, while some box is unticked', () => {
        const onToggle = jest.fn();
        render(<SelectAllToggle allSelected={false} onToggle={onToggle} />);

        const button = screen.getByRole('button', { name: /Select all/ });
        expect(button.querySelector('svg, [data-testid^="icon"]')).not.toBeNull();

        button.click();
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('offers Clear all once every box is ticked', () => {
        render(<SelectAllToggle allSelected onToggle={jest.fn()} />);

        expect(screen.getByRole('button', { name: /Clear all/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Select all/ })).not.toBeInTheDocument();
    });
});
