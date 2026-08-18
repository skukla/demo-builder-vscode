/**
 * A created repository says so, in the field that created it.
 *
 * The form knew — `repoCreationState.isCreated` was already driving the disabled
 * state — but showed nothing for it. The field went grey, the helper text still
 * read "Will be CREATED as skukla/…" in the future tense, and the only
 * confirmation anywhere was a green tick in the summary panel on the far side of
 * the screen. So the surface that did the work was the one surface that stayed
 * silent about it.
 *
 * Spectrum draws a checkmark for `validationState="valid"`, which is how the
 * project-name field marks itself good. `getValidationState` is the shared helper
 * for exactly this tri-state (`core/ui/utils/validationState`) — it was promoted
 * to core in August after existing three times over.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NewRepoForm } from '@/features/eds/ui/steps/repoSelectionInline.helpers';

// A stand-in that exposes the two things this behaviour lives in: the validation
// state Spectrum turns into a checkmark, and the description text.
jest.mock('@adobe/react-spectrum', () => ({
    View: ({ children }: any) => <div>{children}</div>,
    Heading: ({ children }: any) => <h3>{children}</h3>,
    Flex: ({ children }: any) => <div>{children}</div>,
    Button: ({ children, onPress, isDisabled }: any) => (
        <button onClick={onPress} disabled={isDisabled}>
            {children}
        </button>
    ),
    TextField: ({ label, value, description, validationState, errorMessage, isDisabled }: any) => (
        <div>
            <label>{label}</label>
            <input
                aria-label={label}
                value={value}
                readOnly
                disabled={isDisabled}
                data-validation={validationState}
            />
            <span data-testid="description">{description}</span>
            {errorMessage && <span data-testid="error">{errorMessage}</span>}
        </div>
    ),
}));

const baseProps = {
    repoName: 'bodea-team-demo',
    githubUser: { login: 'skukla' },
    templateAvailable: true,
    onRepoNameChange: jest.fn(),
    onRepoNameBlur: jest.fn(),
    onUseExisting: jest.fn(),
    onCreateRepository: jest.fn(),
};

const renderForm = (repoCreationState: Record<string, unknown>, extra = {}) =>
    render(
        <NewRepoForm
            {...baseProps}
            {...extra}
            repoCreationState={repoCreationState as never}
        />,
    );

describe('after the repository is created', () => {
    it('marks the field valid, so Spectrum draws the checkmark', () => {
        renderForm({ isCreated: true, isCreating: false });

        expect(screen.getByLabelText('Repository Name')).toHaveAttribute(
            'data-validation',
            'valid',
        );
    });

    it('is not DISABLED, or Spectrum hides the checkmark it just earned', () => {
        // The mark was rendered and then suppressed: a disabled Spectrum field
        // draws no validation icon. Read-only stops editing without that cost.
        renderForm({ isCreated: true, isCreating: false });

        expect(screen.getByLabelText('Repository Name')).not.toBeDisabled();
    });

    it('says it WAS created, not that it will be', () => {
        renderForm({ isCreated: true, isCreating: false });

        expect(screen.getByTestId('description')).toHaveTextContent(
            'Created as skukla/bodea-team-demo',
        );
    });
});

describe('before and during creation', () => {
    it('claims nothing while the name is only typed', () => {
        renderForm({ isCreated: false, isCreating: false });

        expect(screen.getByLabelText('Repository Name')).not.toHaveAttribute(
            'data-validation',
            'valid',
        );
        expect(screen.getByTestId('description')).toHaveTextContent(
            'Will be created as skukla/bodea-team-demo',
        );
    });

    it('claims nothing while the request is in flight', () => {
        // A checkmark the instant the button is pressed would report success for
        // work that can still fail.
        renderForm({ isCreated: false, isCreating: true });

        expect(screen.getByLabelText('Repository Name')).not.toHaveAttribute(
            'data-validation',
            'valid',
        );
    });
});

describe('errors still win', () => {
    it('shows invalid for a bad name even if something set isCreated', () => {
        renderForm({ isCreated: true, isCreating: false }, { repoNameError: 'Name already taken' });

        expect(screen.getByLabelText('Repository Name')).toHaveAttribute(
            'data-validation',
            'invalid',
        );
        expect(screen.getByTestId('error')).toHaveTextContent('Name already taken');
    });

    it('shows invalid when creation itself failed', () => {
        renderForm({ isCreated: false, isCreating: false, error: 'GitHub rejected the request' });

        expect(screen.getByLabelText('Repository Name')).toHaveAttribute(
            'data-validation',
            'invalid',
        );
    });
});
