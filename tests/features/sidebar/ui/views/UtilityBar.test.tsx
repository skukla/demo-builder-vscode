/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { UtilityBar } from '@/features/sidebar/ui/views/UtilityBar';

const renderWithProvider = (ui: React.ReactElement) =>
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>,
    );

describe('UtilityBar', () => {
    describe('AI menu button', () => {
        it('renders the AI button when onOpenAiMenu is provided', () => {
            renderWithProvider(<UtilityBar onOpenAiMenu={jest.fn()} />);

            expect(screen.getByRole('button', { name: /^ai$/i })).toBeInTheDocument();
        });

        it('does not render the AI button when onOpenAiMenu is omitted', () => {
            renderWithProvider(<UtilityBar onOpenTools={jest.fn()} />);

            expect(screen.queryByRole('button', { name: /^ai$/i })).not.toBeInTheDocument();
        });

        it('calls onOpenAiMenu when the AI button is clicked', () => {
            const onOpenAiMenu = jest.fn();
            renderWithProvider(<UtilityBar onOpenAiMenu={onOpenAiMenu} />);

            fireEvent.click(screen.getByRole('button', { name: /^ai$/i }));

            expect(onOpenAiMenu).toHaveBeenCalled();
        });

        it('renders the AI button alongside the existing utility buttons', () => {
            renderWithProvider(
                <UtilityBar
                    onOpenTools={jest.fn()}
                    onOpenHelp={jest.fn()}
                    onOpenSettings={jest.fn()}
                    onOpenAiMenu={jest.fn()}
                />,
            );

            expect(screen.getByRole('button', { name: /tools/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /get help/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /^ai$/i })).toBeInTheDocument();
        });
    });
});
