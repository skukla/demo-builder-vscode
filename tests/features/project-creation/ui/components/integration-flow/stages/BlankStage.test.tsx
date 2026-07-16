/**
 * BlankStage Tests (Add Integration flow — blank instance-naming stage)
 *
 * Presentational stage mirroring CustomStage's evaluate-and-emit shape: an
 * "Integration name" field whose validity feeds the modal footer via
 * onInstanceChange — a valid, non-colliding name emits the derived
 * `{id, name}` instance; anything else emits undefined (with an inline message
 * for unusable/colliding names). There is NO Add button — the footer's
 * Continue commits.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { BlankStage } from '@/features/project-creation/ui/components/integration-flow/stages/BlankStage';

const PLACEHOLDER = 'e.g. Order Sync, Salesforce CRM, Firefly Image Gen';

/** The collision domain a real modal threads in (catalog id + component + instance). */
const RESERVED = new Set(['app-builder-shell', 'eds-storefront', 'firefly-image-gen']);

type Props = React.ComponentProps<typeof BlankStage>;

function renderStage(props: Partial<Props> = {}): { onInstanceChange: jest.Mock } {
    const onInstanceChange = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <BlankStage
                reservedIds={props.reservedIds ?? RESERVED}
                instance={props.instance}
                onInstanceChange={onInstanceChange}
            />
        </Provider>
    );
    return { onInstanceChange };
}

/**
 * The mocked TextField nests its error span inside the label, so label-text queries
 * break once a message renders — target the input by its stable placeholder instead.
 */
function nameField(): HTMLElement {
    return screen.getByPlaceholderText(PLACEHOLDER);
}

describe('BlankStage', () => {
    it('renders the labelled name field and hint with no validation message initially', () => {
        const { onInstanceChange } = renderStage();
        expect(nameField()).toBeInTheDocument();
        expect(screen.getByText('Integration name')).toBeInTheDocument();
        expect(
            screen.getByText(/A name you'll recognize — distinct from the API Mesh/)
        ).toBeInTheDocument();
        expect(screen.queryByTestId('spectrum-textfield-error')).not.toBeInTheDocument();
        expect(onInstanceChange).not.toHaveBeenCalled();
    });

    it('a valid name emits the derived instance and shows no message', () => {
        const { onInstanceChange } = renderStage();
        fireEvent.change(nameField(), { target: { value: 'Salesforce CRM' } });
        expect(onInstanceChange).toHaveBeenCalledWith({
            id: 'salesforce-crm',
            name: 'Salesforce CRM',
        });
        expect(screen.queryByTestId('spectrum-textfield-error')).not.toBeInTheDocument();
    });

    it('trims surrounding whitespace before deriving the id and display name', () => {
        const { onInstanceChange } = renderStage();
        fireEvent.change(nameField(), { target: { value: '  Order Sync  ' } });
        expect(onInstanceChange).toHaveBeenCalledWith({ id: 'order-sync', name: 'Order Sync' });
    });

    it("a name slugging to the blank catalog id ('app-builder-shell') is rejected inline", () => {
        const { onInstanceChange } = renderStage();
        fireEvent.change(nameField(), { target: { value: 'App Builder Shell' } });
        expect(onInstanceChange).toHaveBeenCalledWith(undefined);
        expect(screen.getByTestId('spectrum-textfield-error')).toHaveTextContent(/already used/);
    });

    it('a name slugging to an already-selected instance id is rejected inline', () => {
        const { onInstanceChange } = renderStage();
        fireEvent.change(nameField(), { target: { value: 'Firefly Image Gen' } });
        expect(onInstanceChange).toHaveBeenCalledWith(undefined);
        expect(screen.getByTestId('spectrum-textfield-error')).toHaveTextContent(/already used/);
    });

    it("a name slugging to a stack component id ('eds-storefront') is rejected inline", () => {
        const { onInstanceChange } = renderStage();
        fireEvent.change(nameField(), { target: { value: 'EDS Storefront' } });
        expect(onInstanceChange).toHaveBeenCalledWith(undefined);
        expect(screen.getByTestId('spectrum-textfield-error')).toHaveTextContent(/already used/);
    });

    it('a name with no usable letters shows the empty-slug message and emits undefined', () => {
        const { onInstanceChange } = renderStage();
        fireEvent.change(nameField(), { target: { value: '123' } });
        expect(onInstanceChange).toHaveBeenCalledWith(undefined);
        expect(screen.getByTestId('spectrum-textfield-error')).toHaveTextContent(
            /at least one letter/
        );
    });

    it('clearing the field emits undefined with no message (merely incomplete)', () => {
        const { onInstanceChange } = renderStage();
        fireEvent.change(nameField(), { target: { value: 'Order Sync' } });
        fireEvent.change(nameField(), { target: { value: '' } });
        expect(onInstanceChange).toHaveBeenLastCalledWith(undefined);
        expect(screen.queryByTestId('spectrum-textfield-error')).not.toBeInTheDocument();
    });

    it('prefills the field from the instance prop (returning to the stage)', () => {
        renderStage({ instance: { id: 'order-sync', name: 'Order Sync' } });
        expect(nameField()).toHaveValue('Order Sync');
    });

    it('a valid edit after a collision clears the message and emits the new instance', () => {
        const { onInstanceChange } = renderStage();
        fireEvent.change(nameField(), { target: { value: 'Firefly Image Gen' } });
        expect(screen.getByTestId('spectrum-textfield-error')).toBeInTheDocument();
        fireEvent.change(nameField(), { target: { value: 'Firefly Video Gen' } });
        expect(onInstanceChange).toHaveBeenLastCalledWith({
            id: 'firefly-video-gen',
            name: 'Firefly Video Gen',
        });
        expect(screen.queryByTestId('spectrum-textfield-error')).not.toBeInTheDocument();
    });
});
