/**
 * PrerequisitesStep — decision coverage (PL-22): the row chrome and the two buttons.
 *
 * Which row gets the spacing class, when the "(Waiting)" and "(Optional)" labels appear,
 * when Install is offered and when it is disabled, what the progress bar is labelled,
 * and what Recheck actually posts — none of which any suite in this family constrained.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { PrerequisitesStep } from '@/features/prerequisites/ui/steps/PrerequisitesStep';
import type { WizardState } from '@/types/webview';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import {
    mockPostMessage,
    renderLoadedStep,
    setupMessageCallbacks,
    resetAllMocks,
    setupScrollMock,
} from './PrerequisitesStep.testUtils';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: (...args: unknown[]) => {
            const { mockPostMessage } = require('./PrerequisitesStep.testUtils');
            return mockPostMessage(...args);
        },
        onMessage: (...args: unknown[]) => {
            const { mockOnMessage } = require('./PrerequisitesStep.testUtils');
            return mockOnMessage(...args);
        },
    },
}));

const THREE = [
    { id: 0, name: 'Node.js', description: 'JavaScript runtime', optional: false },
    { id: 1, name: 'npm', description: 'Package manager', optional: false },
    { id: 2, name: 'Git', description: 'Version control', optional: true },
];

function rows(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('.prerequisite-item'));
}

/** Every `postMessage(type, …)` payload for one type, in call order. */
function posted(type: string): unknown[] {
    return mockPostMessage.mock.calls.filter(([t]) => t === type).map(([, p]) => p);
}

beforeAll(() => setupScrollMock());
beforeEach(() => resetAllMocks());

/** userEvent under this project's fake timers — without advanceTimers, click hangs. */
const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

describe('row spacing', () => {
    it('spaces every row except the last one', async () => {
        await renderLoadedStep(THREE, 'Node.js');

        expect(rows().map((r) => r.className.includes('prerequisite-item-spacing')))
            .toEqual([true, true, false]);
    });

    it('gives a lone row no spacing at all', async () => {
        await renderLoadedStep([THREE[0]], 'Node.js');

        expect(rows().map((r) => r.className.includes('prerequisite-item-spacing')))
            .toEqual([false]);
    });
});

describe('the labels beside a prerequisite name', () => {
    it('marks an optional prerequisite, and only that one', async () => {
        await renderLoadedStep(THREE, 'Node.js');

        expect(screen.getAllByText('(Optional)')).toHaveLength(1);
        expect(rows()[2].textContent).toContain('(Optional)');
    });

    it('shows "(Waiting)" only while a row is still pending', async () => {
        const fire = await renderLoadedStep(THREE, 'Node.js');

        expect(screen.getAllByText('(Waiting)')).toHaveLength(3);

        fire.fireStatus({
            index: 0, name: 'Node.js', status: 'success', description: 'JavaScript runtime',
            required: true, installed: true, message: 'Node.js is installed',
        });

        await waitFor(() => screen.getByText('Node.js is installed'));
        expect(screen.getAllByText('(Waiting)')).toHaveLength(2);
        expect(rows()[0].textContent).not.toContain('(Waiting)');
    });

    it('shows no "(Waiting)" once every row has an answer', async () => {
        const fire = await renderLoadedStep([THREE[0]], 'Node.js');

        fire.fireStatus({
            index: 0, name: 'Node.js', status: 'checking', description: 'JavaScript runtime',
            required: true, message: 'Checking...',
        });

        await waitFor(() => screen.getByText('Checking...'));
        expect(screen.queryByText('(Waiting)')).not.toBeInTheDocument();
    });
});

describe('the Install button', () => {
    async function failed(over: Record<string, unknown> = {}) {
        const fire = await renderLoadedStep(THREE, 'Node.js');
        fire.fireStatus({
            index: 0, name: 'Node.js', status: 'error', description: 'JavaScript runtime',
            required: true, installed: false, message: 'Node.js is not installed',
            canInstall: true, ...over,
        });
        await waitFor(() => screen.getByText('Node.js is not installed'));
        return fire;
    }

    it('is offered for a failed prerequisite that can be installed', async () => {
        await failed();

        expect(screen.getAllByRole('button', { name: 'Install' })).toHaveLength(1);
    });

    it('is NOT offered for a failed prerequisite that cannot be installed', async () => {
        await failed({ canInstall: false });

        expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
    });

    it('is NOT offered for a prerequisite that succeeded', async () => {
        const fire = await renderLoadedStep(THREE, 'Node.js');
        fire.fireStatus({
            index: 0, name: 'Node.js', status: 'success', description: 'JavaScript runtime',
            required: true, installed: true, message: 'Node.js is installed', canInstall: true,
        });

        await waitFor(() => screen.getByText('Node.js is installed'));
        expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
    });

    it('is NOT offered for a warning, whatever it says about installability', async () => {
        const fire = await renderLoadedStep(THREE, 'Node.js');
        fire.fireStatus({
            index: 0, name: 'Node.js', status: 'warning', description: 'JavaScript runtime',
            required: false, installed: false, message: 'Node.js is optional', canInstall: true,
        });

        await waitFor(() => screen.getByText('Node.js is optional'));
        expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
    });

    it('asks the extension to install the row it belongs to', async () => {
        await failed();

        await user().click(screen.getByRole('button', { name: 'Install' }));

        expect(posted('install-prerequisite')).toEqual([{ prereqId: 0 }]);
    });

    it('is enabled until an install actually starts', async () => {
        await failed();

        expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled();
    });

    it('disables Recheck for as long as an install is running', async () => {
        await failed();
        expect(screen.getByRole('button', { name: 'Recheck' })).toBeEnabled();

        await user().click(screen.getByRole('button', { name: 'Install' }));

        expect(screen.getByRole('button', { name: 'Recheck' })).toBeDisabled();
    });
});

describe('while an install is running', () => {
    it('disables the Install button on every OTHER failed row', async () => {
        const fire = await renderLoadedStep(THREE, 'Node.js');
        [0, 1].forEach((index) => fire.fireStatus({
            index, name: THREE[index].name, status: 'error', description: THREE[index].description,
            required: true, installed: false, message: `${THREE[index].name} is not installed`,
            canInstall: true,
        }));
        await waitFor(() => screen.getByText('npm is not installed'));
        expect(screen.getAllByRole('button', { name: 'Install' })).toHaveLength(2);

        await user().click(screen.getAllByRole('button', { name: 'Install' })[0]);

        // The installing row switches to 'checking' and loses its own button; the
        // other one stays on screen and must refuse a second concurrent install.
        const remaining = screen.getAllByRole('button', { name: 'Install' });
        expect(remaining).toHaveLength(1);
        expect(remaining[0]).toBeDisabled();
    });
});

describe('auto-scrolling to the row being checked', () => {
    it('scrolls the container down to a checking row that has fallen below the fold', async () => {
        const fire = await renderLoadedStep(THREE, 'Node.js');
        const container = document.querySelector('.prerequisites-container') as HTMLElement;
        Object.defineProperty(container, 'clientHeight', { value: 100, configurable: true });
        rows().forEach((row, index) => {
            Object.defineProperty(row, 'offsetTop', { value: index * 200, configurable: true });
            Object.defineProperty(row, 'offsetHeight', { value: 180, configurable: true });
        });
        (Element.prototype.scrollTo as jest.Mock).mockClear();

        fire.fireStatus({
            index: 2, name: 'Git', status: 'checking', description: 'Version control',
            required: false, message: 'Checking Git',
        });

        await waitFor(() => expect(Element.prototype.scrollTo).toHaveBeenCalled());
        expect(Element.prototype.scrollTo).toHaveBeenCalledWith({
            top: 400 + 180 - 100 + 10,
            behavior: 'smooth',
        });
    });

    it('leaves the container alone when the checking row is already in view', async () => {
        const fire = await renderLoadedStep(THREE, 'Node.js');
        const container = document.querySelector('.prerequisites-container') as HTMLElement;
        Object.defineProperty(container, 'clientHeight', { value: 1000, configurable: true });
        rows().forEach((row, index) => {
            Object.defineProperty(row, 'offsetTop', { value: index * 20, configurable: true });
            Object.defineProperty(row, 'offsetHeight', { value: 18, configurable: true });
        });
        (Element.prototype.scrollTo as jest.Mock).mockClear();

        fire.fireStatus({
            index: 2, name: 'Git', status: 'checking', description: 'Version control',
            required: false, message: 'Checking Git',
        });

        await waitFor(() => screen.getByText('Checking Git'));
        expect(Element.prototype.scrollTo).not.toHaveBeenCalled();
    });
});

describe('the progress bar on a running row', () => {
    const progress = {
        overall: { percent: 40, currentStep: 2, totalSteps: 3, stepName: 'Installing Node 20' },
    };

    it('labels itself with the step it is on, out of the total', async () => {
        const fire = await renderLoadedStep(THREE, 'Node.js');
        fire.fireStatus({
            index: 0, name: 'Node.js', status: 'checking', description: 'JavaScript runtime',
            required: true, message: 'Working', unifiedProgress: progress,
        });

        await waitFor(() => screen.getByTestId('spectrum-progressbar'));
        const bar = screen.getByTestId('spectrum-progressbar');
        expect(bar).toHaveTextContent('Step 2/3: Installing Node 20');
        expect(bar).toHaveAttribute('aria-valuenow', '40');
    });

    it('appends the command detail when there is one', async () => {
        const fire = await renderLoadedStep(THREE, 'Node.js');
        fire.fireStatus({
            index: 0, name: 'Node.js', status: 'checking', description: 'JavaScript runtime',
            required: true, message: 'Working',
            unifiedProgress: {
                ...progress,
                command: { type: 'determinate', percent: 55, confidence: 'exact', detail: 'downloading' },
            },
        });

        await waitFor(() => screen.getByTestId('spectrum-progressbar'));
        expect(screen.getByTestId('spectrum-progressbar'))
            .toHaveTextContent('Step 2/3: Installing Node 20 - downloading');
    });

    it('appends nothing when the command reports no detail', async () => {
        const fire = await renderLoadedStep(THREE, 'Node.js');
        fire.fireStatus({
            index: 0, name: 'Node.js', status: 'checking', description: 'JavaScript runtime',
            required: true, message: 'Working',
            unifiedProgress: {
                ...progress,
                command: { type: 'determinate', percent: 55, confidence: 'exact' },
            },
        });

        await waitFor(() => screen.getByTestId('spectrum-progressbar'));
        expect(screen.getByTestId('spectrum-progressbar'))
            .toHaveTextContent('Step 2/3: Installing Node 20');
    });

    it('is absent for a running row that reports no progress', async () => {
        const fire = await renderLoadedStep(THREE, 'Node.js');
        fire.fireStatus({
            index: 0, name: 'Node.js', status: 'checking', description: 'JavaScript runtime',
            required: true, message: 'Working',
        });

        await waitFor(() => screen.getByText('Working'));
        expect(screen.queryByTestId('spectrum-progressbar')).not.toBeInTheDocument();
    });

    it('is absent once the row is no longer running, progress or not', async () => {
        const fire = await renderLoadedStep(THREE, 'Node.js');
        fire.fireStatus({
            index: 0, name: 'Node.js', status: 'error', description: 'JavaScript runtime',
            required: true, message: 'Failed', unifiedProgress: progress,
        });

        await waitFor(() => screen.getByText('Failed'));
        expect(screen.queryByTestId('spectrum-progressbar')).not.toBeInTheDocument();
    });
});

describe('the Recheck button', () => {
    /** Answer every row, which is what releases the in-progress latch. */
    async function finishTheRun(fire: { fireStatus: (d: unknown) => void }) {
        THREE.forEach((p, index) => fire.fireStatus({
            index, name: p.name, status: 'success', description: p.description,
            required: !p.optional, installed: true, message: `${p.name} is installed`,
        }));
        await waitFor(() => screen.getByText('Git is installed'));
    }

    it('asks for a RECHECK, not a first check, and scrolls back to the top', async () => {
        const fire = await renderLoadedStep(THREE, 'Node.js');
        await finishTheRun(fire);
        (Element.prototype.scrollTo as jest.Mock).mockClear();

        await user().click(screen.getByRole('button', { name: 'Recheck' }));

        expect(posted('check-prerequisites').at(-1)).toEqual({
            isRecheck: true,
            selectedStack: undefined,
            selectedOptionalDependencies: [],
        });
        expect(Element.prototype.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    });

    it('sends the stack and the mesh components the SC actually opted into', async () => {
        await renderLoadedStep(THREE, 'Node.js', {
            currentStep: 'prerequisites',
            selectedStack: 'eds-accs',
            selectedAppBuilderComponents: ['eds-accs-mesh', 'appbuilder-shell-app'],
        });

        expect(posted('check-prerequisites').at(-1)).toEqual({
            isRecheck: false,
            selectedStack: 'eds-accs',
            selectedOptionalDependencies: ['eds-accs-mesh'],
        });
    });

    it('picks up a change to the SC’s App Builder selection', async () => {
        const fire = setupMessageCallbacks();
        const tree = (components: string[]) => (
            <Provider theme={defaultTheme}>
                <PrerequisitesStep
                    state={{
                        currentStep: 'prerequisites',
                        selectedStack: 'eds-accs',
                        selectedAppBuilderComponents: components,
                    } as unknown as WizardState}
                    updateState={jest.fn()}
                    onNext={jest.fn()}
                    onBack={jest.fn()}
                    setCanProceed={jest.fn()}
                    currentStep="prerequisites"
                />
            </Provider>
        );
        const { rerender } = render(tree(['eds-accs-mesh']));
        fire.fireLoaded({ prerequisites: THREE });
        await waitFor(() => screen.getByText('Node.js'));
        await finishTheRun(fire);

        // A changed selection gives a new check callback, which re-posts on its own —
        // a memo pinned to the wrong dependency would keep sending the old mesh id.
        rerender(tree(['eds-commerce-mesh']));

        await waitFor(() => expect(posted('check-prerequisites').at(-1)).toEqual({
            isRecheck: false,
            selectedStack: 'eds-accs',
            selectedOptionalDependencies: ['eds-commerce-mesh'],
        }));
    });

    it('sends no optional dependencies when the SC chose no App Builder components', async () => {
        await renderLoadedStep(THREE, 'Node.js', {
            currentStep: 'prerequisites',
            selectedStack: 'eds-accs',
        });

        expect(posted('check-prerequisites').at(-1)).toEqual({
            isRecheck: false,
            selectedStack: 'eds-accs',
            selectedOptionalDependencies: [],
        });
    });
});
