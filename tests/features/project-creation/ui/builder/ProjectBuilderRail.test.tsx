/**
 * ProjectBuilderRail Tests (Slice 2 — Step 4)
 *
 * The single-select LEFT rail of the two-column Project Builder step. Pure
 * presentational: it renders one row per BuilderArea using the dashboard
 * subtle-primitive convention (StatusCard), highlights the active row, greys
 * not-ready (stack-gated) rows so they cannot be selected, shows the
 * required/optional tag, and renders the per-area summary text. All behavior
 * is driven by the `areas` prop + `onSelectArea` callback — no state, no data.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ProjectBuilderRail } from '@/features/project-creation/ui/builder/ProjectBuilderRail';
import type { BuilderArea } from '@/features/project-creation/ui/builder/projectBuilderAreas';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const architectureArea: BuilderArea = {
    id: 'architecture',
    label: 'Architecture',
    ready: true,
    summary: 'EDS + PaaS',
};

const appBuilderReadyArea: BuilderArea = {
    id: 'app-builder-components',
    label: 'App Builder Components',
    ready: true,
    requirement: 'optional',
    summary: '2 selected',
};

const appBuilderNotReadyArea: BuilderArea = {
    id: 'app-builder-components',
    label: 'App Builder Components',
    ready: false,
    requirement: 'optional',
    summary: 'None yet',
};

const blockLibrariesRequiredArea: BuilderArea = {
    id: 'block-libraries',
    label: 'Block Libraries',
    ready: true,
    requirement: 'required',
    summary: 'None yet',
};

const readyAreas: BuilderArea[] = [
    architectureArea,
    appBuilderReadyArea,
    blockLibrariesRequiredArea,
];

/** Locate the clickable row container for a given area label. */
function getRow(label: string): HTMLElement {
    const labelNode = screen.getByText(label);
    const row = labelNode.closest('[data-area-id]');
    if (!row) throw new Error(`No rail row found for label "${label}"`);
    return row as HTMLElement;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectBuilderRail', () => {
    describe('rendering rows', () => {
        it('should render one row per area', () => {
            render(
                <ProjectBuilderRail
                    areas={readyAreas}
                    activeAreaId="architecture"
                    onSelectArea={jest.fn()}
                />,
            );

            expect(screen.getByText('Architecture')).toBeInTheDocument();
            expect(screen.getByText('App Builder Components')).toBeInTheDocument();
            expect(screen.getByText('Block Libraries')).toBeInTheDocument();
        });

        it('should render exactly as many rows as areas provided', () => {
            render(
                <ProjectBuilderRail
                    areas={readyAreas}
                    activeAreaId="architecture"
                    onSelectArea={jest.fn()}
                />,
            );

            expect(screen.getAllByRole('button')).toHaveLength(readyAreas.length);
        });

        it('should omit a row when its area is not in the list (non-EDS hides block libraries)', () => {
            render(
                <ProjectBuilderRail
                    areas={[architectureArea, appBuilderReadyArea]}
                    activeAreaId="architecture"
                    onSelectArea={jest.fn()}
                />,
            );

            expect(screen.queryByText('Block Libraries')).not.toBeInTheDocument();
        });

        it('should render the per-area summary text', () => {
            render(
                <ProjectBuilderRail
                    areas={readyAreas}
                    activeAreaId="architecture"
                    onSelectArea={jest.fn()}
                />,
            );

            expect(screen.getByText('EDS + PaaS')).toBeInTheDocument();
            expect(screen.getByText('2 selected')).toBeInTheDocument();
        });
    });

    describe('selection', () => {
        it('should call onSelectArea with the area id when a ready row is clicked', () => {
            const onSelectArea = jest.fn();
            render(
                <ProjectBuilderRail
                    areas={readyAreas}
                    activeAreaId="architecture"
                    onSelectArea={onSelectArea}
                />,
            );

            fireEvent.click(getRow('App Builder Components'));
            expect(onSelectArea).toHaveBeenCalledWith('app-builder-components');
        });

        it('should call onSelectArea with the block-libraries id when that ready row is clicked', () => {
            const onSelectArea = jest.fn();
            render(
                <ProjectBuilderRail
                    areas={readyAreas}
                    activeAreaId="architecture"
                    onSelectArea={onSelectArea}
                />,
            );

            fireEvent.click(getRow('Block Libraries'));
            expect(onSelectArea).toHaveBeenCalledWith('block-libraries');
        });

        it('should not call onSelectArea when a not-ready (greyed) row is clicked', () => {
            const onSelectArea = jest.fn();
            render(
                <ProjectBuilderRail
                    areas={[architectureArea, appBuilderNotReadyArea]}
                    activeAreaId="architecture"
                    onSelectArea={onSelectArea}
                />,
            );

            fireEvent.click(getRow('App Builder Components'));
            expect(onSelectArea).not.toHaveBeenCalled();
        });

        it('should disable the button for a not-ready row', () => {
            render(
                <ProjectBuilderRail
                    areas={[architectureArea, appBuilderNotReadyArea]}
                    activeAreaId="architecture"
                    onSelectArea={jest.fn()}
                />,
            );

            const row = getRow('App Builder Components');
            expect(row).toBeDisabled();
        });

        it('should keep a ready row enabled', () => {
            render(
                <ProjectBuilderRail
                    areas={readyAreas}
                    activeAreaId="architecture"
                    onSelectArea={jest.fn()}
                />,
            );

            expect(getRow('App Builder Components')).not.toBeDisabled();
        });
    });

    describe('active highlight', () => {
        it('should mark the active row as selected via aria-current', () => {
            render(
                <ProjectBuilderRail
                    areas={readyAreas}
                    activeAreaId="app-builder-components"
                    onSelectArea={jest.fn()}
                />,
            );

            expect(getRow('App Builder Components')).toHaveAttribute('aria-current', 'true');
        });

        it('should not mark non-active rows as current', () => {
            render(
                <ProjectBuilderRail
                    areas={readyAreas}
                    activeAreaId="app-builder-components"
                    onSelectArea={jest.fn()}
                />,
            );

            expect(getRow('Architecture')).not.toHaveAttribute('aria-current', 'true');
        });

        it('should apply an active class to the active row', () => {
            render(
                <ProjectBuilderRail
                    areas={readyAreas}
                    activeAreaId="architecture"
                    onSelectArea={jest.fn()}
                />,
            );

            expect(getRow('Architecture').className).toMatch(/active/);
        });
    });

    describe('requirement tag', () => {
        it('should show an "Optional" tag for optional areas', () => {
            render(
                <ProjectBuilderRail
                    areas={[architectureArea, appBuilderReadyArea]}
                    activeAreaId="architecture"
                    onSelectArea={jest.fn()}
                />,
            );

            const row = getRow('App Builder Components');
            expect(within(row).getByText(/optional/i)).toBeInTheDocument();
        });

        it('should show a "Required" tag for required areas', () => {
            render(
                <ProjectBuilderRail
                    areas={[architectureArea, blockLibrariesRequiredArea]}
                    activeAreaId="architecture"
                    onSelectArea={jest.fn()}
                />,
            );

            const row = getRow('Block Libraries');
            expect(within(row).getByText(/required/i)).toBeInTheDocument();
        });

        it('should not show a requirement tag when requirement is undefined', () => {
            render(
                <ProjectBuilderRail
                    areas={[architectureArea]}
                    activeAreaId="architecture"
                    onSelectArea={jest.fn()}
                />,
            );

            const row = getRow('Architecture');
            expect(within(row).queryByText(/required/i)).not.toBeInTheDocument();
            expect(within(row).queryByText(/optional/i)).not.toBeInTheDocument();
        });
    });
});
