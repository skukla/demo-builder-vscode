/**
 * BlankStage Tests (Build-custom source stage — optional-name model).
 *
 * One required choice (the "Start from" cards) and one optional detail (the
 * shared name field). Nothing validates or gates here: the label is a
 * convenience, identity is minted at commit (owner design, 2026-08-27).
 *
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

/** The choice-card button whose title reads `name`. */
function card(name: string): HTMLElement {
    return screen.getByText(name).closest('button') as HTMLElement;
}

/** A seed carrying `description`, everything else the starter kit's shape. */
function seedDescribed(description: string): typeof KIT_SEED {
    return { ...KIT_SEED, description };
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

describe('BlankStage — which card reads as picked', () => {
    it('marks Blank as the pick while no seed is chosen', () => {
        renderStage({ seeds: [KIT_SEED] });

        expect(card('Blank')).toHaveAttribute('data-selected', 'true');
        expect(card('Commerce Integration Starter Kit')).toHaveAttribute(
            'data-selected',
            'false'
        );
    });

    it('moves the pick to the seed once one is chosen', () => {
        renderStage({ seeds: [KIT_SEED], seedId: KIT_SEED.id });

        expect(card('Blank')).toHaveAttribute('data-selected', 'false');
        expect(card('Commerce Integration Starter Kit')).toHaveAttribute(
            'data-selected',
            'true'
        );
    });

    it('keeps the Blank placeholder while seeds are offered but none is picked', () => {
        // The default label comes from the SELECTED seed; with nothing selected
        // it must stay Blank's, not the first seed's.
        renderStage({ seeds: [KIT_SEED] });

        expect(nameField()).toHaveAttribute('placeholder', 'Custom Integration');
    });

    it('does not blow up when the stage is rendered without a seed handler', () => {
        // `onSeedChange` is optional on the props; a read-only render must not
        // turn a click into a TypeError.
        render(
            <Provider theme={defaultTheme}>
                <BlankStage seeds={[KIT_SEED]} onLabelChange={jest.fn()} />
            </Provider>
        );

        expect(() => fireEvent.click(card('Blank'))).not.toThrow();
        expect(() =>
            fireEvent.click(card('Commerce Integration Starter Kit'))
        ).not.toThrow();
    });
});

describe('BlankStage — clamping a seed description', () => {
    it('leaves a description that already fits exactly as written', () => {
        renderStage({ seeds: [seedDescribed('Two words here.')] });

        expect(screen.getByText('Two words here.')).toBeInTheDocument();
    });

    it('leaves a description that is exactly at the limit', () => {
        const exact = `${'c'.repeat(100)} tail-word`;
        expect(exact).toHaveLength(110);

        renderStage({ seeds: [seedDescribed(exact)] });

        expect(screen.getByText(exact)).toBeInTheDocument();
    });

    it('cuts a long description back to the last whole word, space and all', () => {
        // Three things at once, and each one is a decision: the cut lands INSIDE
        // a word, TWO spaces sit before it, and SEVERAL words follow — so the
        // clamp has to cut at the limit (not merely drop the last word), drop
        // the partial word, and take every space it was separated by with it.
        const head = `${'a'.repeat(52)} ${'b'.repeat(52)}`;
        expect(head).toHaveLength(105);

        renderStage({ seeds: [seedDescribed(`${head}  overflowing final words`)] });

        expect(screen.getByText(`${head}\u2026`)).toBeInTheDocument();
    });
});
