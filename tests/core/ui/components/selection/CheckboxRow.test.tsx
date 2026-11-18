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

    // Walk F231: a sentence explaining the box sits on its own line under the name, as help
    // text, where a detail is a word or two beside it.
    it('shows a help sentence on its own line under the name', () => {
        render(<CheckboxRow label="Add to My Welcome Step" help="So you can start new projects from it." isSelected onChange={jest.fn()} />);

        const help = screen.getByText('So you can start new projects from it.');
        expect(help).toHaveClass('checkbox-row-help');
        expect(screen.getByRole('checkbox', { name: /^Add to My Welcome Step/ })).toBeInTheDocument();
    });

    it('shows some-but-not-all when asked', () => {
        render(<CheckboxRow label="Bodea" isSelected={false} isIndeterminate onChange={jest.fn()} />);

        expect(screen.getByRole('checkbox', { name: 'Bodea' })).toHaveAttribute('aria-checked', 'mixed');
    });
});
