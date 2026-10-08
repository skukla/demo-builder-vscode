/**
 * `buildArchitectureChangeHandler`: what a stack change on WelcomeStep does to
 * the wizard — which component configs survive, what architecture-dependent
 * state is cleared, and that nothing happens for a stack the catalog lacks.
 *
 * Driven directly, with the real `stackHelpers`. The WizardContainer
 * stackChange suite still drives the same handler through the wizard.
 */

import { buildArchitectureChangeHandler } from '@/features/project-creation/ui/wizard/architectureChange';
import type { ComponentConfigs } from '@/types/components';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

const stack = (id: string, frontend: string, backend: string, dependencies: string[] = []): Stack => ({
    id,
    name: id,
    description: id,
    frontend,
    backend,
    dependencies,
});

const STACKS = [
    stack('headless-paas', 'headless', 'commerce-paas', ['commerce-mesh']),
    stack('eds-accs', 'eds', 'commerce-accs', ['commerce-mesh']),
];

const CONFIGS: ComponentConfigs = {
    headless: { port: 3000 },
    'commerce-paas': { url: 'https://paas.example' },
    'commerce-mesh': { endpoint: 'https://mesh.example' },
};

/**
 * The wizard state as it stands before the change, with one stale verdict and
 * one EDS cache. Only the fields the handler reads or clears are set; the rest
 * of WizardState is absent, as it is in a state the host has not filled yet.
 */
const BEFORE_FIELDS: Partial<WizardState> = {
    currentStep: 'welcome',
    projectName: 'demo',
    componentConfigs: CONFIGS,
    commerceConnectValid: true,
    storefrontRepoValid: true,
    edsConfig: { accsHost: 'https://old.example' },
};
const BEFORE = BEFORE_FIELDS as WizardState;

describe('buildArchitectureChangeHandler', () => {
    const setCompletedSteps = jest.fn();
    const setState = jest.fn();

    const handlerFor = (componentConfigs: WizardState['componentConfigs']) =>
        buildArchitectureChangeHandler({ stacks: STACKS, componentConfigs, setCompletedSteps, setState });

    /** The state the handler's updater produces from BEFORE. */
    const nextState = (): WizardState => {
        expect(setState).toHaveBeenCalledTimes(1);
        const updater = setState.mock.calls[0][0] as (prev: WizardState) => WizardState;
        return updater(BEFORE);
    };

    beforeEach(() => {
        setCompletedSteps.mockReset();
        setState.mockReset();
    });

    it('keeps the configs of components both stacks share and migrates the frontend config', () => {
        handlerFor(CONFIGS)('headless-paas', 'eds-accs');

        expect(nextState().componentConfigs).toEqual({
            'commerce-mesh': { endpoint: 'https://mesh.example' },
            eds: { port: 3000 },
        });
    });

    it('clears the architecture-dependent state and the cached verdicts, keeping the rest', () => {
        handlerFor(CONFIGS)('headless-paas', 'eds-accs');

        const next = nextState();
        expect(next.edsConfig).toBeUndefined();
        expect(next.commerceConnectValid).toBe(false);
        expect(next.storefrontRepoValid).toBe(false);
        expect(next.projectName).toBe('demo');
        expect(next.currentStep).toBe('welcome');
    });

    it('resets the completed steps to welcome alone', () => {
        handlerFor(CONFIGS)('headless-paas', 'eds-accs');

        expect(setCompletedSteps).toHaveBeenCalledWith(['welcome']);
    });

    it('does nothing at all when the new stack is not in the catalog', () => {
        handlerFor(CONFIGS)('headless-paas', 'no-such-stack');

        expect(setState).not.toHaveBeenCalled();
        expect(setCompletedSteps).not.toHaveBeenCalled();
    });

    it('keeps nothing when there were no configs to migrate', () => {
        handlerFor(undefined)('headless-paas', 'eds-accs');

        expect(nextState().componentConfigs).toStrictEqual({});
    });

    it('keeps nothing when the old stack is unknown, since nothing can be compared', () => {
        handlerFor(CONFIGS)('no-such-stack', 'eds-accs');

        expect(nextState().componentConfigs).toStrictEqual({});
    });
});
