/**
 * One row of a checkbox list: its name, detail and locked reason, and the some-but-not-all state a
 * row standing for several things (a website's stores) shows.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { CheckboxRow } from '@/core/ui/components/selection/CheckboxRow';

describe('CheckboxRow', () => {
    it('shows the name, the detail and why a locked row cannot change', () => {
        render(<CheckboxRow label="Tailspin Store" detail="tailspin_store" reason="Tailspin's own store" isSelected={false} isDisabled onChange={jest.fn()} />);

        const box = screen.getByRole('checkbox', { name: /Tailspin Store/ });
        expect(box).toBeDisabled();
        expect(screen.getByText('tailspin_store')).toBeInTheDocument();
        expect(screen.getByText("Tailspin's own store")).toBeInTheDocument();
    });

    it('shows some-but-not-all when asked', () => {
        render(<CheckboxRow label="Bodea" isSelected={false} isIndeterminate onChange={jest.fn()} />);

        expect(screen.getByRole('checkbox', { name: 'Bodea' })).toHaveAttribute('aria-checked', 'mixed');
    });
});
