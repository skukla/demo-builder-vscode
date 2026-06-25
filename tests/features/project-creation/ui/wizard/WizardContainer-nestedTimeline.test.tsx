/**
 * WizardContainer — sub-step → area → wizard-step progression on Continue/Back
 *
 * The footer Continue/Back is the single LINEAR driver. It walks, in order:
 *   sub-steps (within the Commerce area) → areas → wizard steps.
 *   - Continue within Commerce → advance `state.activeCommerceStep` to the next
 *     Commerce sub-step (currentStep + activeBuildArea UNCHANGED).
 *   - Continue on the LAST Commerce sub-step → advance to the next AREA (reset
 *     `activeCommerceStep` to that area's first sub-step for commerce).
 *   - Continue on the LAST area → advance the wizard step (goNext).
 *   - Back mirrors: previous sub-step → previous area (its LAST sub-step) →
 *     previous wizard step.
 *
 * The build areas are NOT a timeline sub-nav, so <TimelineNav> receives NO
 * build-area child props.
 *
 * TimelineNav captures its props; BuildYourProjectStep is mocked to a stub that
 * always enables the gate (so Continue is clickable). The footer Continue/Back
 * buttons are the REAL ones rendered by WizardContainer, and WizardContainer
 * computes the Commerce sub-steps directly from wizard state.
 *
 * @jest-environment jsdom
 */

// Import shared step/vscode/loader mocks FIRST.
import './WizardContainer.mocks';

import { screen, cleanup, waitFor, act } from '@testing-library/react';
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

// Commerce sub-steps for a NON-ACCS, no-backend create-mode state (sign-in omitted):
// [backend, connection, business-structure, catalog] (4 sub-steps).
const COMMERCE_SUBSTEPS = 4;

/** Click Continue n times (each is a separate await for state to settle). */
async function clickContinue(
    user: ReturnType<typeof userEvent.setup>,
    times: number,
): Promise<void> {
    for (let i = 0; i < times; i++) {
        await user.click(getContinue());
    }
}

/** Flush pending microtasks + the wizard step-transition timer. */
async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
        jest.runOnlyPendingTimers();
        await Promise.resolve();
    });
}

describe('WizardContainer — sub-step → area → wizard-step progression', () => {
    beforeEach(() => {
        setupTest();
        timelineProps.last = undefined;
    });

    afterEach(async () => {
        cleanup();
        await cleanupTest();
    });

    it('passes the visible Build areas to TimelineNav as child steps (rail sub-nav)', async () => {
        renderOnBuildStep();
        await screen.findByTestId('build-your-project-step');

        // The visible areas (Storefront is hidden for this non-EDS stack) render as
        // children under the current Build step, the first active by default, with a
        // per-area status map and a click handler for jumping to a reached area.
        const childIds = (timelineProps.last?.childSteps ?? []).map((c: { id: string }) => c.id);
        expect(childIds).toEqual(['commerce', 'integrations']);
        expect(timelineProps.last?.activeChildId).toBe('commerce');
        expect(timelineProps.last?.childStatusById).toBeDefined();
        expect(typeof timelineProps.last?.onChildClick).toBe('function');
    });

    it('clicking an AHEAD rail area is gated — forward stays on Continue', async () => {
        renderOnBuildStep();
        await screen.findByTestId('build-your-project-step');

        // Active area is the first (Commerce). Clicking the ahead Integrations area is
        // a no-op; forward progression stays gated to the footer Continue.
        await act(async () => {
            timelineProps.last?.onChildClick?.('integrations');
            await Promise.resolve();
        });
        await flush();

        // The ahead click did NOT switch the active area — still Commerce, still on
        // the Build step (real handleAreaClick gates a forward jump).
        expect(timelineProps.last?.activeChildId).toBe('commerce');
        expect(screen.getByTestId('build-your-project-step')).toBeInTheDocument();
    });

    it('Continue walks the Commerce SUB-STEPS before leaving the Commerce area', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderOnBuildStep();
        await screen.findByTestId('build-your-project-step');

        // First Continue advances a SUB-STEP (backend → connection), NOT the area —
        // still on build-your-project, review must not appear.
        await user.click(getContinue());
        expect(screen.getByTestId('build-your-project-step')).toBeInTheDocument();
        expect(screen.queryByTestId('review-step')).not.toBeInTheDocument();

        // DISCRIMINATOR: with the OLD area-only walk, a 2nd Continue would leave the
        // LAST area (integrations) and reach the review wizard step. With the sub-step
        // walk it is still mid-Commerce. Flush the async goNext + transition timer to
        // prove review has NOT been reached after only 2 clicks.
        await user.click(getContinue());
        await flush();
        expect(screen.queryByTestId('review-step')).not.toBeInTheDocument();
        expect(screen.getByTestId('build-your-project-step')).toBeInTheDocument();

        // Walk the rest of the Commerce sub-steps; still on the build step (then we
        // reach the integrations area, still build-your-project).
        await clickContinue(user, COMMERCE_SUBSTEPS - 2);
        await flush();
        expect(screen.getByTestId('build-your-project-step')).toBeInTheDocument();
        expect(screen.queryByTestId('review-step')).not.toBeInTheDocument();
    });

    it('Continue on the LAST sub-step of the LAST area advances the wizard step', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderOnBuildStep();
        await screen.findByTestId('build-your-project-step');

        // Walk all Commerce sub-steps (last sub-step Continue → integrations area).
        await clickContinue(user, COMMERCE_SUBSTEPS);
        expect(screen.getByTestId('build-your-project-step')).toBeInTheDocument();

        // integrations is the LAST area (single sub-step) → Continue advances to review.
        await user.click(getContinue());
        await waitFor(() => {
            expect(screen.getByTestId('review-step')).toBeInTheDocument();
        }, { timeout: 1000 });
    });

    it('Back steps a Commerce SUB-STEP back (currentStep unchanged)', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderOnBuildStep();
        await screen.findByTestId('build-your-project-step');

        // Advance one sub-step (backend → connection); Back renders now.
        await user.click(getContinue());
        const back = getBack();
        expect(back).toBeInTheDocument();

        // Back → previous sub-step (connection → backend), still on build-your-project.
        await user.click(back!);
        expect(screen.getByTestId('build-your-project-step')).toBeInTheDocument();
        expect(screen.queryByTestId('review-step')).not.toBeInTheDocument();
    });

    it('Back on the FIRST sub-step of the FIRST area calls goBack → previous wizard step', async () => {
        // build-your-project is NOT the first wizard step here, so Back renders.
        // On the first sub-step (backend) of the first area (commerce), Back must
        // navigate the WIZARD step back to adobe-auth (goBack).
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

        // On the first sub-step (backend) of the first area (commerce). Back → goBack.
        const back = getBack();
        expect(back).toBeInTheDocument();
        await user.click(back!);

        await waitFor(() => {
            expect(screen.getByTestId('adobe-auth-step')).toBeInTheDocument();
        }, { timeout: 1000 });
        expect(screen.queryByTestId('build-your-project-step')).not.toBeInTheDocument();
    });

    it('canGoBack is true once a Commerce sub-step has been advanced', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderOnBuildStep();
        await screen.findByTestId('build-your-project-step');

        // build-your-project is the FIRST wizard step → no Back at the first sub-step.
        expect(getBack()).not.toBeInTheDocument();

        // Advance one sub-step → a prior sub-step now exists → Back appears.
        await user.click(getContinue());
        expect(getBack()).toBeInTheDocument();
    });
});
