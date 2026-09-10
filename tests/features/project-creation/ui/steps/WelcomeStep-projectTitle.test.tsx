/**
 * The project name field takes a TITLE and derives the slug.
 *
 * It used to run `normalizeProjectName` on every keystroke, so typing
 * "My Bodea Demo" rewrote itself to "my-bodea-demo" under the cursor. The rule
 * was right -- the folder, the dedupe key and the path all need
 * `[a-z][a-z0-9-]*` -- but it was enforced in the one place the user had to
 * look at it.
 *
 * Now the field keeps what was typed and derives the slug beside it. Two things
 * are load-bearing and both are asserted on the ARGUMENT, because `updateState`
 * is a mock and would answer the same whatever it was handed:
 *
 * 1. BOTH values are written. Sending only the title strands every downstream
 *    consumer -- `createHandler` dedupes on the slug and builds the folder from
 *    it -- and sending only the slug is the behaviour being replaced.
 * 2. The slug is still normalised. Nothing about the filesystem changed.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { WelcomeStep } from '@/features/project-creation/ui/steps/WelcomeStep';
import { WizardState } from '@/types/webview';


const mockUpdateState = jest.fn();

const baseState: Partial<WizardState> = {
    currentStep: 'welcome',
    projectName: 'my-demo-project',
    componentConfigs: {},
    adobeAuth: { isAuthenticated: false, isChecking: false },
};

const renderStep = (state: Partial<WizardState>) =>
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            <WelcomeStep
                state={state as WizardState}
                updateState={mockUpdateState}
                setCanProceed={jest.fn()}
                packages={[]}
                stacks={[]}
            />
        </Provider>
    );

const nameField = () => screen.getByLabelText(/project name/i);

/** The last object handed to updateState. */
const lastUpdate = (): Record<string, unknown> => mockUpdateState.mock.calls.at(-1)?.[0] ?? {};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('typing a grammar-friendly title', () => {
    it('keeps what was typed, capitals and spaces intact', () => {
        renderStep(baseState);

        fireEvent.change(nameField(), { target: { value: 'Bodea B2B Demo' } });

        expect(lastUpdate().projectTitle).toBe('Bodea B2B Demo');
    });

    it('derives the slug from it in the same update', () => {
        // Same update, so the two can never be written out of step with each
        // other -- a title saved without its slug would break the folder.
        renderStep(baseState);

        fireEvent.change(nameField(), { target: { value: 'Bodea B2B Demo' } });

        expect(lastUpdate()).toMatchObject({
            projectTitle: 'Bodea B2B Demo',
            projectName: 'bodea-b2b-demo',
        });
    });

    it.each([
        ['My Project', 'my-project'],
        ['Test_Demo', 'test-demo'],
        ['Hello World!', 'hello-world'],
        ['  Leading Space', 'leading-space'],
    ])('normalises %s to %s, exactly as before', (typed, slug) => {
        renderStep(baseState);

        fireEvent.change(nameField(), { target: { value: typed } });

        expect(lastUpdate().projectName).toBe(slug);
    });
});

describe('what the field shows', () => {
    it('displays the title, not the slug', () => {
        renderStep({ ...baseState, projectTitle: 'Bodea B2B Demo', projectName: 'bodea-b2b-demo' });

        expect(nameField()).toHaveValue('Bodea B2B Demo');
    });

    it('falls back to the slug for a project that has no title yet', () => {
        // Edit mode on anything created before this existed.
        renderStep({ ...baseState, projectTitle: undefined, projectName: 'bodea-demo' });

        expect(nameField()).toHaveValue('bodea-demo');
    });

    it('tells the user where it lands on disk', () => {
        // The folder is browsable, so deriving a name they then cannot find
        // would be its own bug.
        renderStep({ ...baseState, projectTitle: 'Bodea B2B Demo', projectName: 'bodea-b2b-demo' });

        expect(screen.getByText(/Folder: bodea-b2b-demo/)).toBeInTheDocument();
    });
});
