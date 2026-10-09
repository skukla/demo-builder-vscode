/**
 * The failed screen of the storefront setup step, rendered on its own.
 *
 * Spectrum and the workflow icons come from the jest.config.js module mapper.
 * Every icon specifier maps to ONE stub, so the icon is identified by the
 * colour class the component gives it.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { StorefrontSetupErrorView } from '@/features/eds/ui/components/StorefrontSetupErrorView';

const setupUser = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

function iconClass(container: HTMLElement): string {
    const icon = container.querySelector('svg');
    if (!icon) throw new Error('no icon rendered');
    return icon.getAttribute('class') ?? '';
}

describe('StorefrontSetupErrorView', () => {
    function renderError(props: { error?: string; message?: string } = {}) {
        const onCancel = jest.fn();
        const onRetry = jest.fn();
        const view = render(
            <StorefrontSetupErrorView
                error={props.error}
                message={props.message ?? ''}
                onCancel={onCancel}
                onRetry={onRetry}
            />,
        );
        return { ...view, onCancel, onRetry };
    }

    it('names the failure with a red alert', () => {
        const { container } = renderError({ error: 'HTTP 502' });
        expect(screen.getByText('Storefront Setup Failed')).toBeInTheDocument();
        expect(iconClass(container)).toBe('text-red-600');
    });

    it('shows the error detail ahead of the message', () => {
        renderError({ error: 'HTTP 502', message: 'Publish failed' });
        expect(screen.getByText('HTTP 502')).toBeInTheDocument();
        expect(screen.queryByText('Publish failed')).not.toBeInTheDocument();
    });

    it('falls back to the message when there is no detail', () => {
        renderError({ message: 'Publish failed' });
        expect(screen.getByText('Publish failed')).toBeInTheDocument();
    });

    it('says something when neither arrived', () => {
        renderError();
        expect(screen.getByText('An error occurred during setup.')).toBeInTheDocument();
    });

    it('wires Cancel and Retry to their own callbacks', async () => {
        const user = setupUser();
        const { onCancel, onRetry } = renderError({ error: 'HTTP 502' });

        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onCancel).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});
