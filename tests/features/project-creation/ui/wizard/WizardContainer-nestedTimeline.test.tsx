/**
 * WizardContainer — build-area progression on Continue/Back (no timeline sub-nav)
 *
 * The build areas (commerce/storefront/integrations) are NO LONGER a nested
 * sub-nav under "Build Your Project" in the timeline. Instead, the wizard walks
 * the VISIBLE areas one at a time via the footer Continue/Back buttons:
 *   - Continue on a non-last area → advance `state.activeBuildArea` to the next
 *     area (currentStep UNCHANGED, still `build-your-project`).
 *   - Continue on the LAST area → advance the wizard step (goNext).
 *   - Back on a non-first area → step `activeBuildArea` to the previous area.
 *   - Back on the first area → goBack (wizard step).
 *
 * <TimelineNav> must therefore receive NO build-area child props.
 *
 * TimelineNav captures its props; BuildYourProjectStep is mocked to a stub that
 * always enables the gate (so Continue is clickable). The footer Continue/Back
 * buttons are the REAL ones rendered by WizardContainer.
 *
 * @jest-environment jsdom
 */

// Import shared step/vscode/loader mocks FIRST.
import './WizardContainer.mocks';

import { screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
// without rendering the real shell (covered by its own suite). The stub always
// enables the gate so the footer Continue button is clickable.
jest.mock('@/features/project-creation/ui/steps/BuildYourProjectStep', () => ({
    BuildYourProjectStep: ({ setCanProceed }: { setCanProceed: (v: boolean) => void }) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return <div data-testid="build-your-project-step" />;
    },
}));

// NOTE: in create mode the wizard starts with no `selectedStack`, so the
// storefront area (EDS-only) is correctly hidden — the visible areas are
// [commerce, integrations].

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

const getContinue = () => screen.getByRole('button', { name: /continue/i });
const getBack = () => screen.queryByRole('button', { name: /back/i });

describe('WizardContainer — build-area progression (no timeline sub-nav)', () => {
    beforeEach(() => {
        setupTest();
        timelineProps.last = undefined;
    });

    afterEach(async () => {
        cleanup();
        await cleanupTest();
    });

    it('passes NO build-area child props to TimelineNav', async () => {
        renderOnBuildStep();
        await screen.findByTestId('build-your-project-step');

        expect(timelineProps.last?.childSteps).toBeUndefined();
        expect(timelineProps.last?.activeChildId).toBeUndefined();
        expect(timelineProps.last?.childStatusById).toBeUndefined();
        expect(timelineProps.last?.onChildClick).toBeUndefined();
    });

    it('Continue on a non-last area advances to the next area (currentStep unchanged)', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderOnBuildStep();
        await screen.findByTestId('build-your-project-step');

        // Visible areas: [commerce, integrations]. Start on commerce (first).
        // Continue → move to integrations WITHOUT leaving build-your-project.
        await user.click(getContinue());

        // Still on the build step (no wizard-step advance).
        expect(screen.getByTestId('build-your-project-step')).toBeInTheDocument();
        // Review step (next wizard step) must NOT have appeared.
        expect(screen.queryByTestId('review-step')).not.toBeInTheDocument();
    });

    it('Continue on the LAST area advances the wizard step', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderOnBuildStep();
        await screen.findByTestId('build-your-project-step');

        // commerce → integrations (last area)
        await user.click(getContinue());
        expect(screen.getByTestId('build-your-project-step')).toBeInTheDocument();

        // integrations is last → Continue advances the wizard step to review.
        await user.click(getContinue());
        await waitFor(() => {
            expect(screen.getByTestId('review-step')).toBeInTheDocument();
        }, { timeout: 1000 });
    });

    it('Back on a non-first area returns to the previous area (currentStep unchanged)', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderOnBuildStep();
        await screen.findByTestId('build-your-project-step');

        // Advance to the second area (integrations) first.
        await user.click(getContinue());
        expect(screen.getByTestId('build-your-project-step')).toBeInTheDocument();

        // Back → return to commerce, still on build-your-project.
        const back = getBack();
        expect(back).toBeInTheDocument();
        await user.click(back!);

        expect(screen.getByTestId('build-your-project-step')).toBeInTheDocument();
        // A second Back (now on the first area) would leave the step — but the
        // build step is the FIRST wizard step here, so Back should call goBack
        // (no-op navigation / no prior step) and not crash.
    });

    it('Back on the first area leaves area progression (calls goBack → previous wizard step)', async () => {
        // build-your-project is NOT the first wizard step here, so Back renders.
        // On the FIRST area (commerce), Back must navigate the WIZARD step back to
        // adobe-auth (goBack), not stay on the build step.
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderWithTheme(
            <WizardContainer
                componentDefaults={createMockComponentDefaults()}
                wizardSteps={[
                    { id: 'adobe-auth', name: 'Adobe Authentication', enabled: true },
                    { id: 'build-your-project', name: 'Build Your Project', enabled: true },
                    { id: 'review', name: 'Review', enabled: true },
                    { id: 'create-project', name: 'Create Project', enabled: true },
                ]}
            />,
        );

        // adobe-auth → build-your-project
        await user.click(getContinue());
        await screen.findByTestId('build-your-project-step');

        // On the first area (commerce). Back → goBack to adobe-auth.
        const back = getBack();
        expect(back).toBeInTheDocument();
        await user.click(back!);

        await waitFor(() => {
            expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
        }, { timeout: 1000 });
        expect(screen.queryByTestId('build-your-project-step')).not.toBeInTheDocument();
    });
});
