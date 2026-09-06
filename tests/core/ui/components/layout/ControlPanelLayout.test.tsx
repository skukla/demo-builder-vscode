import { render, screen } from '@testing-library/react';
import React from 'react';
import { ControlPanelLayout } from '@/core/ui/components/layout/ControlPanelLayout';

/**
 * ControlPanelLayout composes the existing TwoColumnLayout primitive: a
 * full-width masthead over a two-column body (primary actions + edge detail
 * panel), collapsing to a single column when no secondary is provided.
 */
describe('ControlPanelLayout', () => {
    it('renders masthead, primary, and a two-column body when a secondary is provided', () => {
        const { container } = render(
            <ControlPanelLayout
                masthead={<div>MASTHEAD</div>}
                primary={<div>PRIMARY</div>}
                secondary={<div>SECONDARY</div>}
            />,
        );

        expect(screen.getByText('MASTHEAD')).toBeInTheDocument();
        expect(screen.getByText('PRIMARY')).toBeInTheDocument();
        expect(screen.getByText('SECONDARY')).toBeInTheDocument();
        // Two-column body is delegated to TwoColumnLayout.
        expect(container.querySelector('.two-column-layout')).toBeInTheDocument();
        // Secondary content is wrapped in the capped inner panel.
        expect(container.querySelector('.control-panel-secondary-inner')).toBeInTheDocument();
    });

    it('falls back to a single column (no two-column body) when secondary is omitted', () => {
        const { container } = render(
            <ControlPanelLayout
                masthead={<div>MASTHEAD</div>}
                primary={<div>PRIMARY</div>}
            />,
        );

        expect(screen.getByText('MASTHEAD')).toBeInTheDocument();
        expect(screen.getByText('PRIMARY')).toBeInTheDocument();
        expect(container.querySelector('.control-panel-single')).toBeInTheDocument();
        expect(container.querySelector('.two-column-layout')).not.toBeInTheDocument();
    });

    it('caps the secondary panel at its content width and lets it fill that cap', () => {
        // The cap is the whole reason the detail column is transparent rather than a
        // gray edge-sidebar: without it the secondary content stretches to the editor
        // edge. Nothing else in this suite reads the inner panel's style, so dropping
        // it left the layout looking correct to every assertion.
        const { container } = render(
            <ControlPanelLayout primary={<div>PRIMARY</div>} secondary={<div>SECONDARY</div>} />,
        );

        const inner = container.querySelector<HTMLElement>('.control-panel-secondary-inner');

        expect(inner?.style.maxWidth).toBe('400px');
        expect(inner?.style.width).toBe('100%');
    });

    it('honours a caller-supplied secondaryContentWidth', () => {
        const { container } = render(
            <ControlPanelLayout
                primary={<div>PRIMARY</div>}
                secondary={<div>SECONDARY</div>}
                secondaryContentWidth="640px"
            />,
        );

        expect(
            container.querySelector<HTMLElement>('.control-panel-secondary-inner')?.style.maxWidth,
        ).toBe('640px');
    });

    it('applies an additional className to the layout root', () => {
        const { container } = render(
            <ControlPanelLayout
                className="dashboard-control-panel"
                primary={<div>PRIMARY</div>}
            />,
        );

        expect(container.querySelector('.control-panel.dashboard-control-panel')).toBeInTheDocument();
    });
});
