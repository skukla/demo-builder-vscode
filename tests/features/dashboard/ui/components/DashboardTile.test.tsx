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
