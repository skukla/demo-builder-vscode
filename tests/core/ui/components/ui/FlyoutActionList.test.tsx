/**
 * FlyoutActionList: a flyout's actions as quiet rows, the ones that take something away behind a
 * divider. Here: a row whose quick check runs before its action (Delete asking who uses a datapack,
 * owner 2026-11-20) shows a small spinner in its icon's place and cannot be pressed again.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/components/ui/Spinner', () => ({
    Spinner: () => <span data-testid="row-spinner" />,
}));
jest.mock('@/core/ui/components/ui/menuIcons', () => ({
    renderMenuIcon: (icon?: string) => (icon ? <span data-testid={`icon-${icon}`} /> : null),
}));

// The mocks hoist above this import; the component must bind to them.
import { FlyoutActionList } from '@/core/ui/components/ui/FlyoutActionList';

describe('FlyoutActionList', () => {
    it("shows a spinner in place of a pending row's icon, and the row cannot be pressed", () => {
        const onAction = jest.fn();
        render(
            <FlyoutActionList
                rows={[
                    { key: 'save', label: 'Save as File', icon: 'save' },
                    { key: 'remove', label: 'Delete', icon: 'delete', danger: true, pending: true },
                ]}
                onAction={onAction}
            />
        );

        const row = screen.getByRole('button', { name: 'Delete' });
        expect(row).toBeDisabled();
        expect(row).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByTestId('row-spinner')).toBeInTheDocument();
        expect(screen.queryByTestId('icon-delete')).toBeNull();
        fireEvent.click(row);
        expect(onAction).not.toHaveBeenCalled();
    });

    it('CONTROL: a row not pending shows its icon and presses', () => {
        const onAction = jest.fn();
        render(
            <FlyoutActionList
                rows={[{ key: 'remove', label: 'Delete', icon: 'delete', danger: true }]}
                onAction={onAction}
            />
        );

        expect(screen.getByTestId('icon-delete')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(onAction).toHaveBeenCalledWith('remove');
    });
});
