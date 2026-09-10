/**
 * WelcomeStep — which surface it renders, and what the name field is told.
 *
 * Two decisions live here and nothing else in the suite constrained them:
 *
 *  - `hasPackages`/`hasStacks` gate the brand gallery. Both must be non-empty; a
 *    catalog that loaded one list and not the other has to fall back, not render a
 *    gallery over an empty grid. The pair is an AND, and an OR renders the wrong
 *    surface for every half-loaded catalog.
 *  - the field's `validationState` is an ARGUMENT handed to the TextField, separate
 *    from the error message beside it. The stub surfaces it as `data-validation-state`
 *    so the argument can be asserted rather than inferred from the message.
 *
 * Spectrum is stubbed globally via jest `moduleNameMapper`, so there is no per-suite
 * mock preamble; `packages`/`stacks` arrive as props, so no bundled JSON is involved.
 */

import { act, screen } from '@testing-library/react';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { WizardState } from '@/types/webview';
import { PACKAGES, STACKS, nameInput, renderWelcome } from './WelcomeStep.testUtils';
import '@testing-library/jest-dom';

const FOCUS_DELAY = TIMEOUTS.STEP_CONTENT_FOCUS + 100;
const FALLBACK_TEXT = /No demo packages available/;

describe('WelcomeStep — the gallery gate', () => {
    it('renders the gallery when both the packages and the stacks loaded', () => {
        renderWelcome({ packages: PACKAGES, stacks: STACKS });

        expect(screen.getAllByTestId('package-card')).toHaveLength(2);
        expect(screen.queryByText(FALLBACK_TEXT)).not.toBeInTheDocument();
    });

    it('falls back when the packages never arrived, even though the stacks did', () => {
        renderWelcome({ packages: undefined, stacks: STACKS });

        expect(screen.getByText(FALLBACK_TEXT)).toBeInTheDocument();
        expect(screen.queryAllByTestId('package-card')).toHaveLength(0);
    });

    it('falls back when the package list arrived empty', () => {
        renderWelcome({ packages: [], stacks: STACKS });

        expect(screen.getByText(FALLBACK_TEXT)).toBeInTheDocument();
    });

    it('falls back when the stacks never arrived, even though the packages did', () => {
        renderWelcome({ packages: PACKAGES, stacks: undefined });

        expect(screen.getByText(FALLBACK_TEXT)).toBeInTheDocument();
        expect(screen.queryAllByTestId('package-card')).toHaveLength(0);
    });

    it('falls back when the stack list arrived empty', () => {
        renderWelcome({ packages: PACKAGES, stacks: [] });

        expect(screen.getByText(FALLBACK_TEXT)).toBeInTheDocument();
    });

    it('does not demand a package when only half the catalog loaded', () => {
        // Fallback mode has no way to pick a package, so requiring one would strand
        // the SC on a step with nothing to click.
        const { setCanProceed } = renderWelcome({ packages: PACKAGES, stacks: [] });

        expect(setCanProceed).toHaveBeenLastCalledWith(true);
    });

    it('demands a package once the gallery is showing', () => {
        const { setCanProceed } = renderWelcome({ packages: PACKAGES, stacks: STACKS });

        expect(setCanProceed).toHaveBeenLastCalledWith(false);
    });

    it('hands the gallery the real stacks, so the chosen architecture can be named', () => {
        renderWelcome({
            state: { selectedPackage: 'citisignal', selectedStack: 'headless-paas' },
            packages: PACKAGES,
            stacks: STACKS,
        });

        expect(screen.getByText('Architecture: Headless')).toBeInTheDocument();
    });
});

describe('WelcomeStep — the default name and the mount focus', () => {
    it('seeds the default name only when the field is empty', () => {
        const { updateState } = renderWelcome({ state: { projectName: '' } });

        expect(updateState).toHaveBeenCalledWith({ projectName: 'my-commerce-demo' });
    });

    it('leaves a name the project already carries alone', () => {
        const { updateState } = renderWelcome({ state: { projectName: 'kept-name' } });

        expect(updateState).not.toHaveBeenCalledWith({ projectName: 'my-commerce-demo' });
    });

    it('focuses and selects the field only after the focus delay has fully elapsed', () => {
        renderWelcome({ state: { projectName: 'my-demo-project' } });
        const input = nameInput();

        act(() => {
            jest.advanceTimersByTime(FOCUS_DELAY - 1);
        });
        expect(document.activeElement).not.toBe(input);

        act(() => {
            jest.advanceTimersByTime(1);
        });
        expect(document.activeElement).toBe(input);
        expect(input.selectionStart).toBe(0);
        expect(input.selectionEnd).toBe('my-demo-project'.length);
    });

    it('does nothing when the step unmounted before the delay elapsed', () => {
        const { unmount } = renderWelcome({ state: { projectName: 'my-demo-project' } });

        unmount();

        expect(() =>
            act(() => {
                jest.advanceTimersByTime(FOCUS_DELAY);
            }),
        ).not.toThrow();
    });
});

describe('WelcomeStep — the validation state handed to the field', () => {
    it('marks a name that breaks the rules invalid', () => {
        renderWelcome({ state: { projectName: 'My_Project' } });

        expect(nameInput()).toHaveAttribute('data-validation-state', 'invalid');
    });

    it('marks a name that passes them valid', () => {
        renderWelcome({ state: { projectName: 'my-demo-project' } });

        expect(nameInput()).toHaveAttribute('data-validation-state', 'valid');
    });

    it('says nothing at all about a field the SC has not touched', () => {
        // `projectName: undefined` is the untouched field. It must read as neither
        // valid nor invalid, and must not put an error under a field nobody typed in.
        renderWelcome({ state: { projectName: undefined } as Partial<WizardState> });

        expect(nameInput()).not.toHaveAttribute('data-validation-state');
        expect(screen.queryByText(/Project name is required/)).not.toBeInTheDocument();
    });
});

describe('WelcomeStep — the name rules it applies', () => {
    it('lets edit mode keep the name the project already had', () => {
        renderWelcome({
            state: {
                projectName: 'existing-demo',
                wizardMode: 'edit',
                editOriginalName: 'existing-demo',
            },
            existingProjectNames: ['existing-demo'],
        });

        expect(screen.queryByText(/already exists/)).not.toBeInTheDocument();
        expect(nameInput()).toHaveAttribute('data-validation-state', 'valid');
    });

    it('rejects that same name when a NEW project asks for it', () => {
        renderWelcome({
            state: { projectName: 'existing-demo', editOriginalName: 'existing-demo' },
            existingProjectNames: ['existing-demo'],
        });

        expect(screen.getByText(/already exists/)).toBeInTheDocument();
    });

    it('re-validates against a project list that arrives after the first render', () => {
        const { rerender } = renderWelcome({
            state: { projectName: 'late-clash' },
            existingProjectNames: [],
        });
        expect(screen.queryByText(/already exists/)).not.toBeInTheDocument();

        rerender({ state: { projectName: 'late-clash' }, existingProjectNames: ['late-clash'] });

        expect(screen.getByText(/already exists/)).toBeInTheDocument();
    });

    it('re-reports whether the wizard may continue when the name changes', () => {
        const { setCanProceed, rerender } = renderWelcome({ state: { projectName: 'ab' } });
        expect(setCanProceed).toHaveBeenLastCalledWith(false);

        rerender({ state: { projectName: 'abc' } });

        expect(setCanProceed).toHaveBeenLastCalledWith(true);
    });
});
