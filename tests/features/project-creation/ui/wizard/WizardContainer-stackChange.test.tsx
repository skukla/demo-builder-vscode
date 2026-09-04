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
import type { WizardStepDefinition } from '@/types/wizard';

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
            // Drives the conditional storefront step in and out of the list.
            requiresGitHub: true,
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
    const testPackages = [
        { id: 'test-package', name: 'Test Package', configDefaults: {} },
        { id: 'other-package', name: 'Other Package', configDefaults: {} },
    ];
    return {
        __esModule: true,
        loadDemoPackages: async () => testPackages,
        getSelectablePackages: jest.fn(async () => testPackages),
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
    WelcomeStep: ({ state, updateState, setCanProceed, packages }: any) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return (
            <div data-testid="welcome-step">
                <span data-testid="packages">
                    {(packages ?? []).map((p: { id: string }) => p.id).join(',')}
                </span>
                <span data-testid="progress">
                    {state.creationProgress?.currentOperation ?? 'none'}
                </span>
                <button onClick={() => setCanProceed(false)}>block</button>
                <button onClick={() => updateState({ selectedPackage: 'second-hidden' })}>
                    switch-package
                </button>
                <button onClick={() => updateState({ selectedStack: 'stack-a' })}>pick-stack-a</button>
            </div>
        );
    },
}));
jest.mock('@/features/eds/ui/steps/StorefrontSetupStep', () => ({
    StorefrontSetupStep: ({ setCanProceed, updateState }: any) => {
        React.useEffect(() => setCanProceed(true), [setCanProceed]);
        return (
            <div data-testid="storefront-setup-step">
                <button onClick={() => updateState({ selectedStack: 'stack-b' })}>drop-stack</button>
            </div>
        );
    },
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
import {
    getPackageById,
    getSelectablePackages,
} from '@/features/project-creation/ui/helpers/demoPackageLoader';
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

/** Every unsubscribe handed back to the shell, in registration order. */
const unsubscribes: jest.Mock[] = [];

/** The message listener the shell registered for `type`. */
const listenerFor = (type: string) =>
    mockOnMessage.mock.calls.find((call) => call[0] === type)?.[1] as (data: unknown) => void;

const configs = () => JSON.parse(screen.getByTestId('configs').textContent || 'null');

describe('WizardContainer', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        unsubscribes.length = 0;
        mockOnMessage.mockImplementation(() => {
            const unsubscribe = jest.fn();
            unsubscribes.push(unsubscribe);
            return unsubscribe;
        });
        mockRequest.mockResolvedValue({ success: true, type: 'components-data', data: {} });
        (getSelectablePackages as jest.Mock).mockResolvedValue([
            { id: 'test-package', name: 'Test Package', configDefaults: {} },
            { id: 'other-package', name: 'Other Package', configDefaults: {} },
        ]);
        (getPackageById as jest.Mock).mockImplementation(async (id: string) => ({
            id,
            name: id,
            configDefaults: {},
        }));
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
    describe('the settings listeners it owns', () => {
        it('should unsubscribe from both settings pushes when the wizard closes', async () => {
            const { unmount } = await renderWizard();
            const registered = unsubscribes.length;
            expect(registered).toBeGreaterThan(0);

            unmount();

            expect(unsubscribes.filter((fn) => fn.mock.calls.length > 0)).toHaveLength(registered);
        });

        it('should apply a creation-progress push to wizard state', async () => {
            await renderWizard();
            expect(screen.getByTestId('progress')).toHaveTextContent('none');

            await waitFor(() =>
                listenerFor('creationProgress')({ currentOperation: 'Cloning components' })
            );

            await waitFor(() =>
                expect(screen.getByTestId('progress')).toHaveTextContent('Cloning components')
            );
        });
    });

    describe('a project whose package is not on the selectable list', () => {
        const onPackage = (packageId: string) => ({
            editProject: {
                projectName: 'demo',
                projectPath: '/projects/demo',
                settings: { selectedPackage: packageId, selectedStack: 'stack-a' },
            },
        });

        it('should fetch and append the package the project is actually on', async () => {
            await renderWizard(onPackage('hidden-package'));

            await waitFor(() =>
                expect(screen.getByTestId('packages')).toHaveTextContent('hidden-package')
            );
            expect(getPackageById).toHaveBeenCalledWith('hidden-package');
        });

        it('should append nothing when the lookup finds no such package', async () => {
            (getPackageById as jest.Mock).mockResolvedValue(undefined);

            await renderWizard(onPackage('gone'));

            await settle();
            expect(screen.getByTestId('packages')).toHaveTextContent('test-package,other-package');
        });

        it('should not look a package up when the selectable list already has it', async () => {
            await renderWizard(onPackage('other-package'));

            await settle();
            expect(getPackageById).not.toHaveBeenCalled();
        });

        it('should append its package even when nothing at all is selectable', async () => {
            // `every` on an empty list is true, so a dedupe check written that way
            // silently refuses to append the first package. Only an empty list
            // separates the two.
            (getSelectablePackages as jest.Mock).mockResolvedValue([]);

            await renderWizard(onPackage('hidden-package'));

            await waitFor(() =>
                expect(screen.getByTestId('packages')).toHaveTextContent('hidden-package')
            );
        });

        it('should drop an in-flight lookup when the project moves to another package', async () => {
            const resolvers: Record<string, (value: unknown) => void> = {};
            (getPackageById as jest.Mock).mockImplementation(
                (id: string) =>
                    new Promise((resolve) => {
                        resolvers[id] = resolve;
                    })
            );

            await renderWizard(onPackage('first-hidden'));
            await settle();
            await press(screen.getByRole('button', { name: 'switch-package' }));

            // The first lookup answers only AFTER the project moved on. Its result
            // belongs to a package the project no longer has.
            resolvers['first-hidden']?.({ id: 'first-hidden', name: 'first-hidden' });
            resolvers['second-hidden']?.({ id: 'second-hidden', name: 'second-hidden' });
            await settle();

            await waitFor(() =>
                expect(screen.getByTestId('packages')).toHaveTextContent('second-hidden')
            );
            expect(screen.getByTestId('packages')).not.toHaveTextContent('first-hidden');
        });

        it('should not look anything up before the selectable list has landed', async () => {
            // The mount render has an empty `packages`, which means "not loaded"
            // and not "absent" — acting on it looks up every project's package.
            render(
                <Provider theme={defaultTheme}>
                    <WizardContainer wizardSteps={WIZARD_STEPS} {...onPackage('hidden-package')} />
                </Provider>
            );

            expect(getPackageById).not.toHaveBeenCalled();
            await settle();
        });
    });

    describe('the focus trap around the wizard', () => {
        let outside: HTMLButtonElement;

        beforeEach(() => {
            outside = document.createElement('button');
            outside.textContent = 'outside';
            document.body.appendChild(outside);
        });

        afterEach(() => {
            outside.remove();
        });

        it('should leave focus where it was rather than grabbing it on mount', async () => {
            await renderWizard();

            expect(document.activeElement).toBe(document.body);
        });

        it('should pull focus back into the wizard when it escapes', async () => {
            const { container } = await renderWizard();

            outside.focus();

            expect(document.activeElement).not.toBe(outside);
            expect(container.contains(document.activeElement)).toBe(true);
        });

        it('should redirect a Tab pressed from outside into the wizard', async () => {
            const { container } = await renderWizard();
            // Blur back out without tripping containment, so Tab is the only thing
            // that can move focus in.
            document.body.focus();

            fireEvent.keyDown(document, { key: 'Tab' });

            expect(container.contains(document.activeElement)).toBe(true);
        });
    });

    describe('the step-transition animation', () => {
        const stepContent = (container: HTMLElement) =>
            container.querySelector('.step-content') as HTMLElement;

        it('should not mark the content as transitioning while a step is settled', async () => {
            const { container } = await renderWizard();

            expect(stepContent(container).className).not.toContain('transitioning');
        });

        it('should mark the content as transitioning for the length of the swap', async () => {
            const { container } = await renderWizard();
            await goToBuilder();

            fireEvent.click(screen.getByTestId('timeline-step-welcome'));
            expect(stepContent(container).className).toContain('transitioning');

            await waitFor(() => jest.advanceTimersByTime(TIMEOUTS.STEP_TRANSITION));
            await waitFor(() =>
                expect(stepContent(container).className).not.toContain('transitioning')
            );
        });

        it('should not start a transition when the clicked step is already showing', async () => {
            const { container } = await renderWizard();

            fireEvent.click(screen.getByTestId('timeline-step-welcome'));

            expect(stepContent(container).className).not.toContain('transitioning');
        });
    });

    describe('the Continue button', () => {
        it('should be disabled while the step says it cannot be left', async () => {
            await renderWizard();

            await press(screen.getByRole('button', { name: 'block' }));

            expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
        });
    });
    describe('when the current step leaves the list under it', () => {
        /** The storefront step only exists while the chosen stack needs GitHub. */
        const CONDITIONAL_STEPS: WizardStepDefinition[] = [
            { id: 'welcome', name: 'Demo Setup', enabled: true },
            {
                id: 'storefront-setup',
                name: 'Storefront Setup',
                enabled: true,
                condition: { stackRequires: 'requiresGitHub' },
            },
            { id: 'build-your-project', name: 'Build Your Project', enabled: true },
            { id: 'review', name: 'Review', enabled: true },
            { id: 'create-project', name: 'Create Project', enabled: true },
        ];

        it('should name no step rather than throwing when the step was filtered away', async () => {
            const { container } = await renderWizard({ wizardSteps: CONDITIONAL_STEPS });
            await press(screen.getByRole('button', { name: 'pick-stack-a' }));
            await press(screen.getByRole('button', { name: 'Continue' }));
            await waitFor(() => jest.advanceTimersByTime(TIMEOUTS.STEP_TRANSITION));
            await waitFor(() =>
                expect(screen.getByTestId('storefront-setup-step')).toBeInTheDocument()
            );

            // A stack that does not need GitHub drops the step the wizard is ON.
            await press(screen.getByRole('button', { name: 'drop-stack' }));

            expect(screen.queryByTestId('timeline-step-storefront-setup')).not.toBeInTheDocument();
            // No step name to show, and no crash reaching for one.
            expect(container.querySelector('.page-header-subtitle')).toBeNull();
        });
    });
});
