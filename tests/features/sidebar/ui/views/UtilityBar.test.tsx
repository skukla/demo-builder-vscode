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
    it('renders Tools, Help, Settings, and Logs when all callbacks provided', () => {
        renderWithProvider(
            <UtilityBar
                onOpenTools={jest.fn()}
                onOpenHelp={jest.fn()}
                onOpenSettings={jest.fn()}
                onOpenLogs={jest.fn()}
            />,
        );

        expect(screen.getByRole('button', { name: /tools/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /get help/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /view logs/i })).toBeInTheDocument();
    });

    // Owner, 2026-11-07: the Datapack Library, every pack and no project, after Tools.
    it('offers Datapacks after Tools, opening the Datapack Library', () => {
        const onOpenDatapacks = jest.fn();
        renderWithProvider(<UtilityBar onOpenTools={jest.fn()} onOpenDatapacks={onOpenDatapacks} onOpenHelp={jest.fn()} />);

        const names = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'));
        expect(names).toEqual(['Tools', 'Datapack Library', 'Get Help']);
        expect(screen.getByText('Datapacks')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Datapack Library' }));
        expect(onOpenDatapacks).toHaveBeenCalledTimes(1);
    });

    it('omits the Logs button when onOpenLogs is absent', () => {
        renderWithProvider(<UtilityBar onOpenTools={jest.fn()} />);

        expect(screen.queryByRole('button', { name: /view logs/i })).not.toBeInTheDocument();
    });

    it('omits a button when its callback prop is absent', () => {
        renderWithProvider(<UtilityBar onOpenTools={jest.fn()} />);

        expect(screen.getByRole('button', { name: /tools/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /get help/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument();
    });

    it('does NOT render an AI button — AI lives in the AiZone, not the utility row', () => {
        renderWithProvider(
            <UtilityBar
                onOpenTools={jest.fn()}
                onOpenHelp={jest.fn()}
                onOpenSettings={jest.fn()}
            />,
        );

        expect(screen.queryByRole('button', { name: /^ai$/i })).not.toBeInTheDocument();
    });

    it('invokes each callback when its button is clicked', () => {
        const onOpenTools = jest.fn();
        const onOpenHelp = jest.fn();
        const onOpenSettings = jest.fn();
        const onOpenLogs = jest.fn();
        renderWithProvider(
            <UtilityBar
                onOpenTools={onOpenTools}
                onOpenHelp={onOpenHelp}
                onOpenSettings={onOpenSettings}
                onOpenLogs={onOpenLogs}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /tools/i }));
        fireEvent.click(screen.getByRole('button', { name: /get help/i }));
        fireEvent.click(screen.getByRole('button', { name: /settings/i }));
        fireEvent.click(screen.getByRole('button', { name: /view logs/i }));

        expect(onOpenTools).toHaveBeenCalled();
        expect(onOpenHelp).toHaveBeenCalled();
        expect(onOpenSettings).toHaveBeenCalled();
        expect(onOpenLogs).toHaveBeenCalled();
    });
});
