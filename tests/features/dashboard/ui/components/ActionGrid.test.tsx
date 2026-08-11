/**
 * ActionGrid Component Tests
 *
 * Zone membership, gating and interactions. Two siblings hold the rest:
 * ActionGrid-overflow.test.tsx (More menu contents, gating, Delete isolation)
 * and ActionGrid-zoneStatus.test.tsx (the per-zone status lines).
 *
 * Mocks, fixtures and the SUT import live in ActionGrid.testUtils — importing
 * ActionGrid here directly would bind it to real Spectrum (see that file).
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ActionGrid, defaultProps, edsProps, getZone } from './ActionGrid.testUtils';

describe('ActionGrid', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('AI tile removal', () => {
        it('should not render an AI tile (AI lives in the sidebar)', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.queryByText('AI')).not.toBeInTheDocument();
        });

        it('should not render an AI tile for EDS projects', () => {
            render(<ActionGrid {...edsProps} />);

            expect(screen.queryByText('AI')).not.toBeInTheDocument();
        });

        it('should not render an Open in Claude Code tile', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.queryByText('Open in Claude Code')).not.toBeInTheDocument();
        });
    });

    describe('Primary Cluster', () => {
        it('renders NO visible zone heading (grouping is structural, via spacing)', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const primary = getZone(container, 'primary');
            expect(primary).toBeInTheDocument();
            expect(within(primary).queryByText('Primary')).not.toBeInTheDocument();
        });

        it('should place Start in the primary cluster when not running (non-EDS)', () => {
            const { container } = render(<ActionGrid {...defaultProps} isRunning={false} />);

            const primary = getZone(container, 'primary');
            expect(primary).toBeInTheDocument();
            expect(within(primary).getByText('Start')).toBeInTheDocument();
            expect(within(primary).queryByText('Stop')).not.toBeInTheDocument();
        });

        it('should place Stop in the primary cluster when running (non-EDS)', () => {
            const { container } = render(<ActionGrid {...defaultProps} isRunning={true} />);

            const primary = getZone(container, 'primary');
            expect(within(primary).getByText('Stop')).toBeInTheDocument();
            expect(within(primary).queryByText('Start')).not.toBeInTheDocument();
        });

        it('should place Open in Browser in the primary cluster', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const primary = getZone(container, 'primary');
            expect(within(primary).getByText('Open in Browser')).toBeInTheDocument();
        });

        it('should place the Author button in the primary cluster for EDS projects', () => {
            const { container } = render(<ActionGrid {...edsProps} />);

            const primary = getZone(container, 'primary');
            expect(within(primary).getByText('Author Content')).toBeInTheDocument();
        });

        it('labels the Author button "Author Content" regardless of the resolved experience', () => {
            render(<ActionGrid {...edsProps} authoringExperience="experience-workspace" />);

            // Static label — the resolved experience still decides WHERE the
            // action opens (backend-side), not the tile text.
            expect(screen.getByRole('button', { name: 'Author Content' })).toBeInTheDocument();
            expect(screen.queryByText(/Author in/)).not.toBeInTheDocument();
        });

        it('should not render an Author button for non-EDS projects', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.queryByText('Author Content')).not.toBeInTheDocument();
        });

        it('should mark primary tiles with the hero accent modifier class', () => {
            render(<ActionGrid {...defaultProps} />);

            const openButton = screen.getByText('Open in Browser').closest('button');
            // Mock renders UNSAFE_className as a lowercase attribute
            expect(openButton?.getAttribute('unsafe_classname')).toContain(
                'dashboard-action-button--hero'
            );
        });

        it('should mark the Author button with the hero accent modifier class', () => {
            render(<ActionGrid {...edsProps} />);

            const authorButton = screen.getByText('Author Content').closest('button');
            expect(authorButton?.getAttribute('unsafe_classname')).toContain(
                'dashboard-action-button--hero'
            );
        });

        it('should not render Start/Stop in the primary cluster for EDS projects', () => {
            const { container } = render(<ActionGrid {...edsProps} />);

            const primary = getZone(container, 'primary');
            expect(within(primary).queryByText('Start')).not.toBeInTheDocument();
            expect(within(primary).queryByText('Stop')).not.toBeInTheDocument();
        });
    });

    describe('Manage Commerce Tile', () => {
        it('should place Manage Commerce in the primary cluster (non-EDS)', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const primary = getZone(container, 'primary');
            expect(within(primary).getByText('Manage Commerce')).toBeInTheDocument();
        });

        it('should place Manage Commerce in the primary cluster for EDS projects', () => {
            const { container } = render(<ActionGrid {...edsProps} />);

            const primary = getZone(container, 'primary');
            expect(within(primary).getByText('Manage Commerce')).toBeInTheDocument();
        });

        it('should mark the Manage Commerce tile with the hero accent modifier class', () => {
            render(<ActionGrid {...defaultProps} />);

            const adminButton = screen.getByText('Manage Commerce').closest('button');
            expect(adminButton?.getAttribute('unsafe_classname')).toContain(
                'dashboard-action-button--hero'
            );
        });

        it('should not disable Manage Commerce while isOpeningBrowser (resolves backend-side)', () => {
            render(<ActionGrid {...defaultProps} isOpeningBrowser={true} />);

            expect(screen.getByText('Manage Commerce').closest('button')).not.toBeDisabled();
        });

        it('should call handleOpenAdminPanel when Manage Commerce clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} />);

            await user.click(screen.getByText('Manage Commerce'));

            expect(defaultProps.handleOpenAdminPanel).toHaveBeenCalled();
        });
    });

    describe('Storefront Zone (EDS only)', () => {
        it('should not render a storefront zone for non-EDS projects', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            expect(getZone(container, 'storefront')).not.toBeInTheDocument();
        });

        it('should render a storefront zone for EDS projects', () => {
            const { container } = render(<ActionGrid {...edsProps} />);

            expect(getZone(container, 'storefront')).toBeInTheDocument();
        });

        it('renders NO visible zone heading (tile labels carry the meaning)', () => {
            const { container } = render(<ActionGrid {...edsProps} />);

            const storefront = getZone(container, 'storefront');
            expect(within(storefront).queryByText('Storefront')).not.toBeInTheDocument();
        });

        it('no longer holds Sync Storefront — that moved to the More menu', () => {
            const { container } = render(<ActionGrid {...edsProps} />);

            const storefront = getZone(container, 'storefront');
            expect(within(storefront).queryByText('Sync Storefront')).not.toBeInTheDocument();
        });

        it('should not place the Author button in the storefront zone', () => {
            const { container } = render(<ActionGrid {...edsProps} />);

            const storefront = getZone(container, 'storefront');
            expect(within(storefront).queryByText('Author Content')).not.toBeInTheDocument();
        });

        it('should not render Sync Storefront for non-EDS projects', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.queryByText('Sync Storefront')).not.toBeInTheDocument();
        });

        it('survives without handleSyncStorefront — Republish is what the zone is for now', () => {
            const { handleSyncStorefront: _handleSyncStorefront, ...edsNoSync } = edsProps;
            const { container } = render(<ActionGrid {...edsNoSync} />);

            expect(getZone(container, 'storefront')).toBeInTheDocument();
            expect(screen.queryByText('Sync Storefront')).not.toBeInTheDocument();
        });
    });

    describe('Build Zone', () => {
        it('renders NO visible zone heading (grouping is structural, via spacing)', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const build = getZone(container, 'build');
            expect(within(build).queryByText('Build')).not.toBeInTheDocument();
        });

        it('should place Configure in the build zone', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const build = getZone(container, 'build');
            expect(within(build).getByText('Configure')).toBeInTheDocument();
        });

        it('never renders a Deploy Mesh tile (mesh lives in the integrations list, D3 Step 08)', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.queryByText('Deploy Mesh')).not.toBeInTheDocument();
        });
    });

    describe('Open Browser Gating', () => {
        it('should disable Open button when not running (non-EDS)', () => {
            render(<ActionGrid {...defaultProps} isRunning={false} />);

            const openButton = screen.getByText('Open in Browser').closest('button');
            expect(openButton).toBeDisabled();
        });

        it('should enable Open button when running (non-EDS)', () => {
            render(<ActionGrid {...defaultProps} isRunning={true} />);

            const openButton = screen.getByText('Open in Browser').closest('button');
            expect(openButton).not.toBeDisabled();
        });

        it('should disable Open button when isOpeningBrowser is true (non-EDS)', () => {
            render(<ActionGrid {...defaultProps} isRunning={true} isOpeningBrowser={true} />);

            const openButton = screen.getByText('Open in Browser').closest('button');
            expect(openButton).toBeDisabled();
        });

        it('should disable EDS Open in Browser only while isOpeningBrowser', () => {
            render(<ActionGrid {...edsProps} isOpeningBrowser={false} />);
            expect(screen.getByText('Open in Browser').closest('button')).not.toBeDisabled();
        });

        it('should disable EDS Open in Browser when isOpeningBrowser is true', () => {
            render(<ActionGrid {...edsProps} isOpeningBrowser={true} />);
            expect(screen.getByText('Open in Browser').closest('button')).toBeDisabled();
        });
    });

    describe('Start/Stop Gating', () => {
        it('should disable Start when isStartDisabled is true', () => {
            render(<ActionGrid {...defaultProps} isRunning={false} isStartDisabled={true} />);

            expect(screen.getByText('Start').closest('button')).toBeDisabled();
        });

        it('should disable Stop when isStopDisabled is true', () => {
            render(<ActionGrid {...defaultProps} isRunning={true} isStopDisabled={true} />);

            expect(screen.getByText('Stop').closest('button')).toBeDisabled();
        });
    });

    describe('Mesh Action Disabled State', () => {
        it('should disable Configure when isMeshActionDisabled is true', () => {
            render(<ActionGrid {...defaultProps} isMeshActionDisabled={true} />);

            const configureButton = screen.getByText('Configure').closest('button');
            expect(configureButton).toBeDisabled();
        });
    });

    describe('Button Interactions', () => {
        it('should call handleStartDemo when Start clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} isRunning={false} />);

            await user.click(screen.getByText('Start'));

            expect(defaultProps.handleStartDemo).toHaveBeenCalled();
        });

        it('should call handleStopDemo when Stop clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} isRunning={true} />);

            await user.click(screen.getByText('Stop'));

            expect(defaultProps.handleStopDemo).toHaveBeenCalled();
        });

        it('should call handleOpenBrowser when Open clicked (non-EDS)', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} isRunning={true} />);

            await user.click(screen.getByText('Open in Browser'));

            expect(defaultProps.handleOpenBrowser).toHaveBeenCalled();
        });

        it('should call handleConfigure when Configure clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} />);

            await user.click(screen.getByText('Configure'));

            expect(defaultProps.handleConfigure).toHaveBeenCalled();
        });
    });

    describe('EDS-Specific Interactions', () => {
        it('should call handleOpenLiveSite when Open in Browser clicked (EDS)', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...edsProps} />);

            await user.click(screen.getByText('Open in Browser'));

            expect(edsProps.handleOpenLiveSite).toHaveBeenCalled();
        });

        it('should call handleOpenDaLive when the Author button clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...edsProps} />);

            await user.click(screen.getByText('Author Content'));

            expect(edsProps.handleOpenDaLive).toHaveBeenCalled();
        });

        it('keeps the static "Author Content" label for the EW experience too', () => {
            render(<ActionGrid {...edsProps} authoringExperience="experience-workspace" />);

            expect(screen.getByRole('button', { name: 'Author Content' })).toHaveTextContent(
                'Author Content'
            );
        });

        it('renders no authoring-experience flip/switch control (relocated to Configure)', () => {
            // The flip control moved to the Configure webview (setup-time preference).
            render(<ActionGrid {...edsProps} authoringExperience="da-live-classic" />);

            expect(screen.queryByText('Switch to Experience Workspace')).not.toBeInTheDocument();
            expect(screen.queryByText('Switch to DA.live Classic')).not.toBeInTheDocument();
        });

        it('should call handleSyncStorefront when Sync Storefront clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...edsProps} />);

            await user.click(screen.getByText('Sync Storefront'));

            expect(edsProps.handleSyncStorefront).toHaveBeenCalled();
        });
    });
});
