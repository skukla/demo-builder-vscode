/**
 * CustomIntegrationRow Tests (Custom Integration — inline expand)
 *
 * A single GitHub-URL config is light, so this type-row expands IN PLACE rather than opening a
 * modal: Add reveals a URL field; a valid, not-yet-added repo enables the inline Add, which
 * commits via onAdd and collapses the row. A duplicate or invalid URL keeps Add disabled.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { CustomIntegrationRow } from '@/features/project-creation/ui/components/CustomIntegrationRow';

const VALID_URL = 'https://github.com/acme/widget';

function renderRow(selectedIds: string[] = []): { onAdd: jest.Mock } {
    const onAdd = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <CustomIntegrationRow selectedIds={selectedIds} onAdd={onAdd} />
        </Provider>,
    );
    return { onAdd };
}

describe('CustomIntegrationRow', () => {
    it('renders collapsed with an Add control and no URL field', () => {
        renderRow();
        expect(screen.getByText('Custom Integration')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Custom GitHub URL')).not.toBeInTheDocument();
    });

    it('Add expands the row to reveal the URL field (header becomes Cancel)', () => {
        renderRow();
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        expect(screen.getByLabelText('Custom GitHub URL')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('a valid new URL enables the inline Add; it commits and collapses', () => {
        const { onAdd } = renderRow();
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        fireEvent.change(screen.getByLabelText('Custom GitHub URL'), {
            target: { value: VALID_URL },
        });
        const inlineAdd = screen.getByRole('button', { name: 'Add' });
        expect(inlineAdd).toBeEnabled();
        fireEvent.click(inlineAdd);
        expect(onAdd).toHaveBeenCalledWith({ owner: 'acme', repo: 'widget' });
        // Collapsed again: the URL field is gone.
        expect(screen.queryByLabelText('Custom GitHub URL')).not.toBeInTheDocument();
    });

    it('keeps Add disabled until the URL is a valid repo', () => {
        renderRow();
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('Custom GitHub URL'), {
            target: { value: 'not-a-url' },
        });
        expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    });

    it('disables Add for an already-added repo (no duplicate)', () => {
        renderRow(['acme-widget']);
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));
        fireEvent.change(screen.getByLabelText('Custom GitHub URL'), {
            target: { value: VALID_URL },
        });
        expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    });
});
