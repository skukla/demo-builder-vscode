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
