/**
 * WizardContainer — nested timeline wiring (Nested Builder — Slice 1, step 4)
 *
 * When the wizard is on `build-your-project`, the parent <TimelineNav> renders a
 * single indented sub-level: the VISIBLE build areas (commerce/storefront/
 * integrations) as `children`, with `activeChildId` from `state.activeBuildArea`
 * and a `childStatusById` map. Clicking a child must ONLY update
 * `state.activeBuildArea` — it must NEVER change `currentStep`.
 *
 * TimelineNav and BuildYourProjectStep are mocked to lightweight stubs that
 * capture their props, so the test asserts the WIRING (which children, active id,
 * onChildClick behavior) rather than re-rendering the real components.
 *
 * @jest-environment jsdom
 */

// Import shared step/vscode/loader mocks FIRST.
import './WizardContainer.mocks';

import { screen, cleanup, act } from '@testing-library/react';
import React from 'react';
import { WizardContainer } from '@/features/project-creation/ui/wizard/WizardContainer';
import '@testing-library/jest-dom';
import {
    createMockComponentDefaults,
    setupTest,
    cleanupTest,
    renderWithTheme,
} from './WizardContainer.testUtils';

// ---------------------------------------------------------------------------
// Capture TimelineNav props across renders.
// ---------------------------------------------------------------------------

interface CapturedTimelineProps {
    childSteps?: { id: string; name: string }[];
    activeChildId?: string;
    childStatusById?: Record<string, string>;
    onChildClick?: (childId: string) => void;
    currentStepIndex: number;
}

const timelineProps: { last?: CapturedTimelineProps } = {};

jest.mock('@/core/ui/components/TimelineNav', () => ({
    TimelineNav: (props: CapturedTimelineProps) => {
        timelineProps.last = props;
        return <div data-testid="timeline-nav" />;
    },
}));

// BuildYourProjectStep is mocked so the wizard can sit on `build-your-project`
// without rendering the real shell (covered by its own suite).
jest.mock('@/features/project-creation/ui/steps/BuildYourProjectStep', () => ({
    BuildYourProjectStep: ({ setCanProceed }: { setCanProceed: (v: boolean) => void }) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return <div data-testid="build-your-project-step" />;
    },
}));

// NOTE: in create mode the wizard starts with no `selectedStack`, so the
// storefront area (EDS-only) is correctly hidden — the visible areas are
// [commerce, integrations]. That's the right surface for asserting the WIRING
// (children passed, activeChildId, onChildClick) without needing to drive a
// stack selection through the full create flow.

// Steps that put `build-your-project` first so the wizard initializes on it.
const buildFirstSteps = [
    { id: 'build-your-project', name: 'Build Your Project', enabled: true },
    { id: 'review', name: 'Review', enabled: true },
    { id: 'create-project', name: 'Create Project', enabled: true },
];

function renderOnBuildStep() {
    return renderWithTheme(
        <WizardContainer
            componentDefaults={createMockComponentDefaults()}
            wizardSteps={buildFirstSteps}
        />,
    );
}

describe('WizardContainer — nested timeline on build-your-project', () => {
    beforeEach(() => {
        setupTest();
        timelineProps.last = undefined;
    });

    afterEach(async () => {
        cleanup();
        await cleanupTest();
    });

    it('passes the visible build areas as TimelineNav children', async () => {
        renderOnBuildStep();
        await screen.findByTestId('build-your-project-step');

        // No stack selected → storefront hidden; commerce + integrations remain.
        const childSteps = timelineProps.last?.childSteps ?? [];
        expect(childSteps.map(c => c.id)).toEqual(['commerce', 'integrations']);
    });

    it('sets activeChildId to the first area when activeBuildArea is unset', async () => {
        renderOnBuildStep();
        await screen.findByTestId('build-your-project-step');

        expect(timelineProps.last?.activeChildId).toBe('commerce');
    });

    it('provides a childStatusById map for the visible areas', async () => {
        renderOnBuildStep();
        await screen.findByTestId('build-your-project-step');

        const map = timelineProps.last?.childStatusById ?? {};
        expect(Object.keys(map).sort()).toEqual(['commerce', 'integrations']);
    });

    it('onChildClick updates activeBuildArea without changing currentStep', async () => {
        renderOnBuildStep();
        await screen.findByTestId('build-your-project-step');

        // Clicking a visible child switches the active area...
        act(() => {
            timelineProps.last?.onChildClick?.('integrations');
        });

        // ...and the step still renders (currentStep unchanged → no transition away).
        expect(screen.getByTestId('build-your-project-step')).toBeInTheDocument();
        // activeChildId reflects the new area on the next render.
        expect(timelineProps.last?.activeChildId).toBe('integrations');
    });
});
