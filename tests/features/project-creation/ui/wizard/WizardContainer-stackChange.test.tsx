/**
 * The three things the wizard shell does that nothing else can do for it:
 * change the architecture, jump backwards on the timeline, and keep the
 * block-library settings it was handed in sync with VS Code.
 *
 * All three were uncovered. `handleArchitectureChange` in particular is the
 * single choke point for a stack change — it decides which component configs
 * survive and clears the EDS state that must not — and the mocked WelcomeStep
 * the other suites use never calls it.
 *
 * This suite carries its own mock preamble rather than the shared
 * `WizardContainer.mocks`, because it needs a WelcomeStep that can call
 * `onArchitectureChange` and print what the shell handed back.
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

import type { CustomBlockLibrary } from '@/types/blockLibraries';

const mockPostMessage = jest.fn();
const mockRequest = jest.fn();
const mockOnMessage = jest.fn();

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: {
        postMessage: (...args: unknown[]) => mockPostMessage(...args),
        request: (...args: unknown[]) => mockRequest(...args),
        onMessage: (...args: unknown[]) => mockOnMessage(...args),
        createProject: jest.fn(),
    },
}));

/**
 * Three stacks, and the DECOY is first on purpose.
 *
 * The shell looks both the old and the new stack up by id. With the wanted
 * stack first in the list, a lookup that ignores its predicate — or inverts it —
 * still lands on the right entry, and the test passes while proving nothing.
 */
jest.mock('@/features/project-creation/ui/helpers/brandStackLoader', () => ({
    __esModule: true,
    loadStacks: async () => [
        {
            id: 'stack-decoy',
            name: 'Decoy',
            frontend: 'fe-c',
            backend: 'be-c',
            dependencies: ['mesh-c'],
        },
        {
            id: 'stack-a',
            name: 'Stack A',
            frontend: 'fe-a',
            backend: 'be-a',
            dependencies: ['mesh-a'],
        },
        {
            id: 'stack-b',
            name: 'Stack B',
            frontend: 'fe-b',
            backend: 'be-b',
            dependencies: ['mesh-b'],
        },
    ],
}));

jest.mock('@/features/project-creation/ui/helpers/demoPackageLoader', () => {
    const testPackages = [{ id: 'test-package', name: 'Test Package', configDefaults: {} }];
    return {
        __esModule: true,
        loadDemoPackages: async () => testPackages,
        getSelectablePackages: async () => testPackages,
        getPackageById: jest.fn(async (id: string) => testPackages.find((p) => p.id === id)),
    };
});

/**
 * A WelcomeStep that can drive the shell: seed component configs, ask for a
 * stack change, and print what came back.
 */
jest.mock('@/features/project-creation/ui/steps/BuildYourProjectStep', () => ({
    BuildYourProjectStep: ({
        state,
        updateState,
        setCanProceed,
        onArchitectureChange,
        blockLibraryDefaults,
        customBlockLibraryDefaults,
    }: any) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return (
            <div data-testid="build-step">
                <span data-testid="configs">{JSON.stringify(state.componentConfigs ?? null)}</span>
                <span data-testid="eds-config">{JSON.stringify(state.edsConfig ?? null)}</span>
                <span data-testid="connect-valid">{String(state.commerceConnectValid)}</span>
                <span data-testid="custom-libs">
                    {JSON.stringify(state.customBlockLibraries ?? null)}
                </span>
                <span data-testid="lib-defaults">
                    {JSON.stringify(blockLibraryDefaults ?? null)}
                </span>
                <span data-testid="custom-lib-defaults">
                    {JSON.stringify(customBlockLibraryDefaults ?? null)}
                </span>
                <button
                    onClick={() =>
                        updateState({
                            componentConfigs: { 'fe-a': { port: 3000 } },
                            edsConfig: { repoName: 'seeded' },
                            commerceConnectValid: true,
                            customBlockLibraries: [
                                { name: 'Kept', source: { owner: 'acme', repo: 'kept', branch: 'main' } },
                                { name: 'Dropped', source: { owner: 'acme', repo: 'dropped', branch: 'main' } },
                            ],
                        })
                    }
                >
                    seed
                </button>
                <button onClick={() => onArchitectureChange('stack-a', 'stack-b')}>switch</button>
                <button onClick={() => onArchitectureChange('stack-a', 'nope')}>
                    switch-unknown
                </button>
            </div>
        );
    },
}));

const stepStub =
    (testId: string) =>
    ({ setCanProceed }: { setCanProceed: (v: boolean) => void }) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return <div data-testid={testId}>{testId}</div>;
    };

jest.mock('@/features/project-creation/ui/steps/WelcomeStep', () => ({
    WelcomeStep: (props: any) => stepStub('welcome-step')(props),
}));
jest.mock('@/features/eds/ui/steps/StorefrontSetupStep', () => ({
    StorefrontSetupStep: (props: any) => stepStub('storefront-setup-step')(props),
}));
jest.mock('@/features/prerequisites/ui/steps/PrerequisitesStep', () => ({
    PrerequisitesStep: (props: any) => stepStub('prerequisites-step')(props),
}));
jest.mock('@/features/project-creation/ui/steps/ReviewStep', () => ({
    ReviewStep: (props: any) => stepStub('review-step')(props),
}));
jest.mock('@/features/project-creation/ui/steps/ProjectCreationStep', () => ({
    ProjectCreationStep: () => <div data-testid="project-creation-step">creation</div>,
}));

// Below the mocks on purpose: they hoist above this file's imports only.
import { WizardContainer } from '@/features/project-creation/ui/wizard/WizardContainer';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

import { press, settle } from '../../../../helpers/reactSettle';

const WIZARD_STEPS = [
    { id: 'welcome', name: 'Demo Setup', enabled: true },
    { id: 'build-your-project', name: 'Build Your Project', enabled: true },
    { id: 'review', name: 'Review', enabled: true },
    { id: 'create-project', name: 'Create Project', enabled: true },
];

/** Walk from the welcome step to the builder, which is where the rich stub lives. */
const goToBuilder = async () => {
    await press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => jest.advanceTimersByTime(TIMEOUTS.STEP_TRANSITION));
    await waitFor(() => expect(screen.getByTestId('build-step')).toBeInTheDocument());
};

const renderWizard = async (props: Partial<React.ComponentProps<typeof WizardContainer>> = {}) => {
    const view = render(
        <Provider theme={defaultTheme}>
            <WizardContainer wizardSteps={WIZARD_STEPS} {...props} />
        </Provider>
    );
    await settle();
    return view;
};

/** The message listener the shell registered for `type`. */
const listenerFor = (type: string) =>
    mockOnMessage.mock.calls.find((call) => call[0] === type)?.[1] as (data: unknown) => void;

const configs = () => JSON.parse(screen.getByTestId('configs').textContent || 'null');

describe('WizardContainer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockOnMessage.mockReturnValue(jest.fn());
        mockRequest.mockResolvedValue({ success: true, type: 'components-data', data: {} });
    });

    describe('changing the architecture', () => {
        const seedThenSwitch = async (button: 'switch' | 'switch-unknown') => {
            await renderWizard();
            await goToBuilder();
            await press(screen.getByRole('button', { name: 'seed' }));
            await press(screen.getByRole('button', { name: button }));
        };

        it('should migrate the frontend config to the new stack and drop the rest', async () => {
            await seedThenSwitch('switch');

            expect(configs()).toEqual({ 'fe-b': { port: 3000 } });
        });

        it('should clear the architecture-dependent EDS state and cached verdicts', async () => {
            await seedThenSwitch('switch');

            expect(screen.getByTestId('eds-config')).toHaveTextContent('null');
            expect(screen.getByTestId('connect-valid')).toHaveTextContent('false');
        });

        it('should do nothing at all when the new stack is not in the catalog', async () => {
            await seedThenSwitch('switch-unknown');

            expect(configs()).toEqual({ 'fe-a': { port: 3000 } });
            expect(screen.getByTestId('connect-valid')).toHaveTextContent('true');
        });

        it('should keep nothing when there were no configs to migrate', async () => {
            await renderWizard();
            await goToBuilder();

            await press(screen.getByRole('button', { name: 'switch' }));

            expect(configs()).toEqual({});
        });
    });

    describe('jumping back on the timeline', () => {
        it('should move to the clicked step after the transition delay', async () => {
            await renderWizard();
            await goToBuilder();

            fireEvent.click(screen.getByTestId('timeline-step-welcome'));

            // The step swap is deferred so the outgoing content can animate out.
            expect(screen.getByTestId('build-step')).toBeInTheDocument();
            await waitFor(() => jest.advanceTimersByTime(TIMEOUTS.STEP_TRANSITION));
            await waitFor(() => expect(screen.getByTestId('welcome-step')).toBeInTheDocument());
        });

        it('should ignore a click on the step already showing', async () => {
            await renderWizard();

            fireEvent.click(screen.getByTestId('timeline-step-welcome'));
            await waitFor(() => jest.advanceTimersByTime(TIMEOUTS.STEP_TRANSITION));

            expect(screen.getByTestId('welcome-step')).toBeInTheDocument();
        });

        it('should not offer a forward jump as a click target', async () => {
            await renderWizard();

            expect(screen.getByTestId('timeline-step-welcome')).toHaveAttribute('role', 'button');
            expect(screen.getByTestId('timeline-step-review')).not.toHaveAttribute('role');
        });
    });

    describe('block-library settings arriving from VS Code', () => {
        it('should hand the step the built-in defaults it was pushed', async () => {
            await renderWizard({ blockLibraryDefaults: ['starter'] });
            await goToBuilder();
            expect(screen.getByTestId('lib-defaults')).toHaveTextContent('["starter"]');

            await waitFor(() =>
                listenerFor('blockLibraryDefaultsUpdated')({
                    blockLibraryDefaults: ['starter', 'b2b'],
                })
            );

            await waitFor(() =>
                expect(screen.getByTestId('lib-defaults')).toHaveTextContent('["starter","b2b"]')
            );
        });

        it('should hand the step the custom libraries it was pushed', async () => {
            const custom: CustomBlockLibrary[] = [
                { name: 'Kept', source: { owner: 'acme', repo: 'kept', branch: 'main' } },
            ];
            await renderWizard({ customBlockLibraryDefaults: custom });
            await goToBuilder();

            await waitFor(() =>
                listenerFor('customBlockLibraryDefaultsUpdated')({
                    customBlockLibraryDefaults: [
                        ...custom,
                        { name: 'New', source: { owner: 'acme', repo: 'new', branch: 'main' } },
                    ],
                })
            );

            await waitFor(() =>
                expect(screen.getByTestId('custom-lib-defaults')).toHaveTextContent('New')
            );
        });

        it('should drop a committed library that the settings no longer offer', async () => {
            const both: CustomBlockLibrary[] = [
                { name: 'Kept', source: { owner: 'acme', repo: 'kept', branch: 'main' } },
                { name: 'Dropped', source: { owner: 'acme', repo: 'dropped', branch: 'main' } },
            ];
            await renderWizard({ customBlockLibraryDefaults: both });
            await goToBuilder();
            await press(screen.getByRole('button', { name: 'seed' }));
            expect(screen.getByTestId('custom-libs')).toHaveTextContent('Dropped');

            await waitFor(() =>
                listenerFor('customBlockLibraryDefaultsUpdated')({
                    customBlockLibraryDefaults: [both[0]],
                })
            );

            await waitFor(() =>
                expect(screen.getByTestId('custom-libs')).not.toHaveTextContent('Dropped')
            );
            expect(screen.getByTestId('custom-libs')).toHaveTextContent('Kept');
        });
    });

    describe('the shell itself', () => {
        it('should name the current step in the header', async () => {
            const { container } = await renderWizard();

            expect(container.querySelector('.page-header-subtitle')).toHaveTextContent(
                'Demo Setup'
            );
        });

        it('should constrain the footer width and keep Continue enabled once the step allows it', async () => {
            const { container } = await renderWizard();

            expect(container.querySelector('.footer-content-container')).not.toBeNull();
            expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
        });

        it('should render the timeline in its compact form with a header', async () => {
            const { container } = await renderWizard();

            expect(container.querySelector('.timeline-sidebar')).not.toBeNull();
            expect(screen.getByText('Setup Progress')).toBeInTheDocument();
        });
    });
});
