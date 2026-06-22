/**
 * ConfigTile Tests (R1b — Step 2)
 *
 * The reusable config tile for the group-paced wizard steps: a `selector-card`
 * with a label, a one-line summary, and a status badge (⚠ Needs setup → ✓
 * Configured). Clicking or keyboard-activating it opens the concern's focused
 * modal (the parent supplies onPress).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { ConfigTile } from '@/features/project-creation/ui/components/ConfigTile';

const renderTile = (props: Partial<React.ComponentProps<typeof ConfigTile>> = {}) => {
    const onPress = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <ConfigTile
                label="Backend"
                summary="EDS + PaaS · connected"
                status="configured"
                onPress={onPress}
                testId="backend-tile"
                {...props}
            />
        </Provider>,
    );
    return { onPress };
};

describe('ConfigTile', () => {
    it('renders the label and summary', () => {
        renderTile();
        expect(screen.getByText('Backend')).toBeInTheDocument();
        expect(screen.getByText('EDS + PaaS · connected')).toBeInTheDocument();
    });

    it('shows a "Needs setup" badge for needs-setup status', () => {
        renderTile({ status: 'needs-setup', summary: undefined });
        expect(screen.getByText(/needs setup/i)).toBeInTheDocument();
        expect(screen.getByTestId('backend-tile')).toHaveAttribute('data-status', 'needs-setup');
    });

    it('shows a "Configured" badge for configured status', () => {
        renderTile({ status: 'configured' });
        expect(screen.getByText(/configured/i)).toBeInTheDocument();
        expect(screen.getByTestId('backend-tile')).toHaveAttribute('data-status', 'configured');
    });

    it('fires onPress when clicked', () => {
        const { onPress } = renderTile();
        fireEvent.click(screen.getByTestId('backend-tile'));
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('fires onPress on Enter and Space', () => {
        const { onPress } = renderTile();
        const tile = screen.getByTestId('backend-tile');
        fireEvent.keyDown(tile, { key: 'Enter' });
        fireEvent.keyDown(tile, { key: ' ' });
        expect(onPress).toHaveBeenCalledTimes(2);
    });

    it('is an accessible button', () => {
        renderTile();
        const tile = screen.getByRole('button', { name: /backend/i });
        expect(tile).toHaveAttribute('tabIndex', '0');
    });
});
