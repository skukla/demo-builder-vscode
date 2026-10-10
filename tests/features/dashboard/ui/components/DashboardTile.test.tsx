/**
 * A dot and the words explaining it are ONE thing.
 *
 * Three dashboard tiles grew a status dot independently — the lifecycle tile,
 * the remedy tiles, and the integrations summary — and the third shipped without
 * a tooltip, so its amber/red dot was a coloured pixel with no way to learn what
 * it meant. Convention did not hold across three call sites.
 *
 * So the pairing is structural: `status` carries the variant AND its tooltip in
 * one object. There is no way to pass a dot without saying what it means, which
 * is the rule this component exists to keep.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@adobe/react-spectrum', () => {
    const { domProps } = jest.requireActual('../../../../helpers/spectrumStubProps');
    return {
        ActionButton: ({ children, onPress, isDisabled, ...props }: any) => (
            <button onClick={onPress} disabled={isDisabled} {...domProps(props)}>
                {children}
            </button>
        ),
        Text: ({ children, ...props }: any) => <span {...domProps(props)}>{children}</span>,
        TooltipTrigger: ({ children }: any) => <>{children}</>,
        Tooltip: ({ children }: any) => <span role="tooltip">{children}</span>,
    };
});

// Imported after the Spectrum mock above — see ActionGrid.testUtils for why
// this ordering matters.
import { DashboardTile } from '@/features/dashboard/ui/components/DashboardTile';

const icon = <span data-testid="icon" />;

describe('DashboardTile', () => {
    it('renders a dot together with the tooltip that explains it', () => {
        render(
            <DashboardTile
                label="Republish"
                icon={icon}
                onPress={jest.fn()}
                status={{
                    variant: 'warning',
                    tooltip: 'Republish needed — configuration changed',
                    testId: 'republish-tile-dot',
                }}
            />
        );

        expect(screen.getByTestId('republish-tile-dot')).toHaveAttribute('data-variant', 'warning');
        expect(screen.getByRole('tooltip')).toHaveTextContent(
            'Republish needed — configuration changed'
        );
    });

    it('shows the idle tooltip and no dot when there is no status', () => {
        render(
            <DashboardTile
                label="Republish"
                icon={icon}
                onPress={jest.fn()}
                tooltip="Push config and authored content to the CDN"
            />
        );

        expect(screen.queryByTestId('republish-tile-dot')).not.toBeInTheDocument();
        expect(screen.getByRole('tooltip')).toHaveTextContent(
            'Push config and authored content to the CDN'
        );
    });

    it('prefers the status tooltip over the idle one when dotted', () => {
        render(
            <DashboardTile
                label="Restart"
                icon={icon}
                onPress={jest.fn()}
                tooltip="Stop and start the demo again"
                status={{ variant: 'warning', tooltip: 'Restart needed', testId: 'd' }}
            />
        );

        expect(screen.getByRole('tooltip')).toHaveTextContent('Restart needed');
    });

    it('renders no tooltip at all when neither is given', () => {
        // Permitted — a plain action tile. What is NOT permitted is a dot
        // without one, and the type makes that unrepresentable.
        render(<DashboardTile label="Configure" icon={icon} onPress={jest.fn()} />);

        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('fires onPress and can be disabled', () => {
        const onPress = jest.fn();
        const { rerender } = render(<DashboardTile label="Start" icon={icon} onPress={onPress} />);
        screen.getByText('Start').click();
        expect(onPress).toHaveBeenCalledTimes(1);

        rerender(<DashboardTile label="Start" icon={icon} onPress={onPress} isDisabled />);
        expect(screen.getByRole('button')).toBeDisabled();
    });

    it('on a card, shows the dot and its word in place of the description, not in a corner', () => {
        const { container } = render(
            <DashboardTile
                label="Integrations"
                description="Connected systems"
                icon={icon}
                onPress={jest.fn()}
                status={{ variant: 'warning', tooltip: 'Needs sign-in', label: 'Needs sign-in', testId: 'dot' }}
            />
        );

        expect(screen.queryByText('Connected systems')).not.toBeInTheDocument();
        const line = container.querySelector('.dashboard-tile-text .dashboard-tile-status--inline');
        expect(line).not.toBeNull();
        expect(within(line as HTMLElement).getByTestId('dot')).toBeInTheDocument();
        expect(within(line as HTMLElement).getByText('Needs sign-in')).toBeInTheDocument();
        expect(screen.getAllByTestId('dot')).toHaveLength(1);
    });

    // The second line belongs to cards. A tile with no description has no second
    // line to put the word on, so its dot and word stay in the corner overlay.
    it('on a tile with no description, keeps a worded status in the corner', () => {
        const { container } = render(
            <DashboardTile
                label="Integrations"
                icon={icon}
                onPress={jest.fn()}
                status={{ variant: 'warning', tooltip: 'Needs sign-in', label: 'Needs sign-in', testId: 'dot' }}
            />
        );

        const corner = container.querySelector('.dashboard-tile-status') as HTMLElement;
        expect(corner).not.toBeNull();
        expect(corner).not.toHaveClass('dashboard-tile-status--inline');
        expect(within(corner).getByTestId('dot')).toHaveAttribute('data-variant', 'warning');
        expect(within(corner).getByText('Needs sign-in')).toHaveAttribute('data-variant', 'warning');
    });

    // A card whose status has no word has nothing to say on its second line, so
    // the description stays and the dot goes to the corner.
    it('on a card, keeps the description when the status carries no word', () => {
        const { container } = render(
            <DashboardTile
                label="Integrations"
                description="Connected systems"
                icon={icon}
                onPress={jest.fn()}
                status={{ variant: 'error', tooltip: 'Deploy failed', testId: 'dot' }}
            />
        );

        expect(screen.getByText('Connected systems')).toBeInTheDocument();
        expect(container.querySelector('.dashboard-tile-status--inline')).toBeNull();
        const corner = container.querySelector('.dashboard-tile-status') as HTMLElement;
        expect(within(corner).getByTestId('dot')).toHaveAttribute('data-variant', 'error');
        expect(corner.querySelector('.dashboard-tile-status-text')).toBeNull();
    });

    it('on a card with nothing to report, keeps the description', () => {
        render(
            <DashboardTile label="Integrations" description="Connected systems" icon={icon} onPress={jest.fn()} />
        );

        expect(screen.getByText('Connected systems')).toBeInTheDocument();
    });

    it('keeps the dot inside the tile so hover targets one element', () => {
        render(
            <DashboardTile
                label="Integrations"
                icon={icon}
                onPress={jest.fn()}
                status={{ variant: 'error', tooltip: 'Deploy failed', testId: 'dot' }}
            />
        );

        expect(within(screen.getByRole('button')).getByTestId('dot')).toBeInTheDocument();
    });
});
