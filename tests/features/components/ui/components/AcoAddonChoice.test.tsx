/**
 * The ACO add-on's one checkbox (PL-60 P1), shared by the wizard's Catalog step and Configure:
 * off by default, absent where the package does not offer ACO, locked on where it requires it.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AcoAddonChoice } from '@/features/components/ui/components/AcoAddonChoice';

const setupUser = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

describe('AcoAddonChoice', () => {
    it('renders nothing where the package does not offer ACO', () => {
        const { container } = render(<AcoAddonChoice offer="not-offered" isOn={false} onChange={jest.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('offers ACO unticked, and asks to turn it on when ticked', async () => {
        const onChange = jest.fn();
        render(<AcoAddonChoice offer="optional" isOn={false} onChange={onChange} />);
        const box = screen.getByRole('checkbox', { name: /Adobe Commerce Optimizer/ });
        expect(box).not.toBeChecked();
        await setupUser().click(box);
        expect(onChange).toHaveBeenCalledWith(true);
    });

    it('asks to turn it off when unticked', async () => {
        const onChange = jest.fn();
        render(<AcoAddonChoice offer="optional" isOn onChange={onChange} />);
        await setupUser().click(screen.getByRole('checkbox', { name: /Adobe Commerce Optimizer/ }));
        expect(onChange).toHaveBeenCalledWith(false);
    });

    it('is ticked and locked where the package requires ACO, saying why', () => {
        render(<AcoAddonChoice offer="required" isOn={false} onChange={jest.fn()} />);
        const box = screen.getByRole('checkbox', { name: /Adobe Commerce Optimizer/ });
        expect(box).toBeChecked();
        expect(box).toBeDisabled();
        expect(screen.getByText('This demo package requires it')).toBeInTheDocument();
    });

    it('shows the note it is given, such as what saving will do', () => {
        render(<AcoAddonChoice offer="optional" isOn onChange={jest.fn()} note="Saving sets up the ACO credential" />);
        expect(screen.getByText('Saving sets up the ACO credential')).toBeInTheDocument();
    });
});
