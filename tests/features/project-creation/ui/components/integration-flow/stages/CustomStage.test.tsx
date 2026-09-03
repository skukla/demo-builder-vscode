/**
 * CustomStage Tests (Add Integration flow — custom GitHub-URL stage)
 *
 * Presentational stage relocating the CustomUrlForm core: a GitHub-URL field whose
 * validity feeds the modal footer via onSourceChange — a valid, not-yet-added repo emits
 * the parsed {owner, repo}; anything else emits undefined (with an inline message for
 * invalid/duplicate input). There is NO Add button — the footer's Continue commits.
 *
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { CustomStage } from '@/features/project-creation/ui/components/integration-flow/stages/CustomStage';

const VALID_URL = 'https://github.com/acme/widget';

type Props = React.ComponentProps<typeof CustomStage>;

function renderStage(props: Partial<Props> = {}): { onSourceChange: jest.Mock } {
    const onSourceChange = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <CustomStage
                selectedIds={props.selectedIds ?? []}
                source={props.source}
                onSourceChange={onSourceChange}
                onLabelChange={jest.fn()}
            />
        </Provider>
    );
    return { onSourceChange };
}

/**
 * The mocked TextField nests its error span inside the label, so label-text queries
 * break once a message renders — target the input by its stable placeholder instead.
 */
function urlField(): HTMLElement {
    return screen.getByPlaceholderText('https://github.com/owner/repo');
}

describe('CustomStage', () => {
    it('renders the labelled GitHub URL field with no validation message initially', () => {
        const { onSourceChange } = renderStage();
        expect(urlField()).toBeInTheDocument();
        expect(screen.getByText('GitHub URL')).toBeInTheDocument();
        expect(screen.queryByTestId('spectrum-textfield-error')).not.toBeInTheDocument();
        expect(onSourceChange).not.toHaveBeenCalled();
    });

    it('a valid new URL calls onSourceChange with the parsed source and shows no message', () => {
        const { onSourceChange } = renderStage();
        fireEvent.change(urlField(), { target: { value: VALID_URL } });
        expect(onSourceChange).toHaveBeenCalledWith({ owner: 'acme', repo: 'widget' });
        expect(screen.queryByTestId('spectrum-textfield-error')).not.toBeInTheDocument();
    });

    it('an invalid URL calls onSourceChange(undefined) and shows an inline message', () => {
        const { onSourceChange } = renderStage();
        fireEvent.change(urlField(), { target: { value: 'not-a-url' } });
        expect(onSourceChange).toHaveBeenCalledWith(undefined);
        expect(screen.getByTestId('spectrum-textfield-error')).toHaveTextContent(
            /GitHub repository URL/
        );
    });

    it('a non-GitHub host is invalid', () => {
        const { onSourceChange } = renderStage();
        fireEvent.change(urlField(), { target: { value: 'https://gitlab.com/acme/widget' } });
        expect(onSourceChange).toHaveBeenCalledWith(undefined);
        expect(screen.getByTestId('spectrum-textfield-error')).toBeInTheDocument();
    });

    it('an already-added repo calls onSourceChange(undefined) with a duplicate message', () => {
        const { onSourceChange } = renderStage({ selectedIds: ['acme-widget'] });
        fireEvent.change(urlField(), { target: { value: VALID_URL } });
        expect(onSourceChange).toHaveBeenCalledWith(undefined);
        expect(screen.getByTestId('spectrum-textfield-error')).toHaveTextContent(/already added/);
    });

    it('clearing the field calls onSourceChange(undefined) with no message', () => {
        const { onSourceChange } = renderStage();
        fireEvent.change(urlField(), { target: { value: VALID_URL } });
        fireEvent.change(urlField(), { target: { value: '' } });
        expect(onSourceChange).toHaveBeenLastCalledWith(undefined);
        expect(screen.queryByTestId('spectrum-textfield-error')).not.toBeInTheDocument();
    });

    it('prefills the field from the source prop', () => {
        renderStage({ source: { owner: 'acme', repo: 'widget' } });
        expect(urlField()).toHaveValue('https://github.com/acme/widget');
    });

    it('accepts a .git-suffixed URL (repo parsed without the suffix)', () => {
        const { onSourceChange } = renderStage();
        fireEvent.change(urlField(), { target: { value: 'https://github.com/acme/widget.git' } });
        expect(onSourceChange).toHaveBeenCalledWith({ owner: 'acme', repo: 'widget' });
    });

    it('trims surrounding whitespace before parsing', () => {
        const { onSourceChange } = renderStage();
        fireEvent.change(urlField(), { target: { value: `  ${VALID_URL}  ` } });
        expect(onSourceChange).toHaveBeenCalledWith({ owner: 'acme', repo: 'widget' });
    });

    it('a valid edit after a duplicate clears the message and emits the new source', () => {
        const { onSourceChange } = renderStage({ selectedIds: ['acme-widget'] });
        fireEvent.change(urlField(), { target: { value: VALID_URL } });
        expect(screen.getByTestId('spectrum-textfield-error')).toBeInTheDocument();
        fireEvent.change(urlField(), { target: { value: 'https://github.com/acme/other' } });
        expect(onSourceChange).toHaveBeenLastCalledWith({ owner: 'acme', repo: 'other' });
        expect(screen.queryByTestId('spectrum-textfield-error')).not.toBeInTheDocument();
    });
});
