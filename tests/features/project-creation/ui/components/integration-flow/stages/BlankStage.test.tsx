/**
 * BlankStage Tests (Build-custom source stage — optional-name model).
 *
 * One required choice (the "Start from" cards) and one optional detail (the
 * shared name field). Nothing validates or gates here: the label is a
 * convenience, identity is minted at commit (owner design, 2026-08-27).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { BlankStage } from '@/features/project-creation/ui/components/integration-flow/stages/BlankStage';

type Props = React.ComponentProps<typeof BlankStage>;

/** The starter kit's shape, real catalog description included. */
const KIT_SEED = {
    id: 'commerce-integration-starter-kit',
    name: 'Commerce Integration Starter Kit',
    description:
        "Adobe's Commerce integration starter kit (App Management generation): scaffolding " +
        'for bidirectional product, customer, order and stock sync.',
    kind: 'integration' as const,
    layout: 'extension' as const,
    source: { owner: 'adobe', repo: 'commerce-integration-starter-kit', branch: 'main' },
};

function renderStage(props: Partial<Props> = {}): {
    onSeedChange: jest.Mock;
    onLabelChange: jest.Mock;
} {
    const onSeedChange = jest.fn();
    const onLabelChange = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <BlankStage
                seeds={props.seeds}
                seedId={props.seedId}
                selectedIds={props.selectedIds}
                onSeedChange={onSeedChange}
                label={props.label}
                onLabelChange={onLabelChange}
            />
        </Provider>
    );
    return { onSeedChange, onLabelChange };
}

function nameField(): HTMLElement {
    return screen.getByLabelText(/Name \(optional\)/);
}

describe('BlankStage — starting-point cards', () => {
    it('always offers Blank, with the owner-approved copy (no "build it out with AI")', () => {
        renderStage();
        expect(screen.getByText('Blank')).toBeInTheDocument();
        expect(screen.getByText('An empty custom integration.')).toBeInTheDocument();
        expect(screen.queryByText(/build it out with AI/i)).not.toBeInTheDocument();
    });

    it('labels the card group as the "Start from" sub-choice', () => {
        renderStage();
        expect(screen.getByText('Start from')).toBeInTheDocument();
    });

    it("a seed card shows the entry's REAL description, not a generated repeat of its title", () => {
        renderStage({ seeds: [KIT_SEED] });
        expect(screen.getByText(/scaffolding for bidirectional product/)).toBeInTheDocument();
        expect(
            screen.queryByText(/Start from Commerce Integration Starter Kit and/)
        ).not.toBeInTheDocument();
    });

    it('picking a seed emits its id; picking Blank emits undefined', () => {
        const { onSeedChange } = renderStage({ seeds: [KIT_SEED] });
        fireEvent.click(screen.getByText('Commerce Integration Starter Kit'));
        expect(onSeedChange).toHaveBeenCalledWith('commerce-integration-starter-kit');
        fireEvent.click(screen.getByText('Blank'));
        expect(onSeedChange).toHaveBeenLastCalledWith(undefined);
    });

    it('an already-added seed is disabled with the one-per-project note', () => {
        const { onSeedChange } = renderStage({
            seeds: [KIT_SEED],
            selectedIds: ['commerce-integration-starter-kit'],
        });
        expect(screen.getByText('Already added — one per project')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Commerce Integration Starter Kit'));
        expect(onSeedChange).not.toHaveBeenCalled();
    });
});

describe('BlankStage — the optional name', () => {
    it('shows the default as a PLACEHOLDER (not text) and no hint prose', () => {
        renderStage();
        expect(nameField()).toHaveValue('');
        expect(nameField()).toHaveAttribute('placeholder', 'Custom Integration');
        expect(screen.queryByText(/A name you'll recognize/)).not.toBeInTheDocument();
    });

    it("the placeholder follows the selected seed's name", () => {
        renderStage({ seeds: [KIT_SEED], seedId: 'commerce-integration-starter-kit' });
        expect(nameField()).toHaveAttribute('placeholder', 'Commerce Integration Starter Kit');
    });

    it('typing emits raw keystrokes; nothing validates or blocks', () => {
        const { onLabelChange } = renderStage();
        fireEvent.change(nameField(), { target: { value: 'Order Sync' } });
        expect(onLabelChange).toHaveBeenCalledWith('Order Sync');
        // No error affordance exists on this field at all.
        expect(screen.queryByTestId('spectrum-textfield-error')).not.toBeInTheDocument();
    });
});
