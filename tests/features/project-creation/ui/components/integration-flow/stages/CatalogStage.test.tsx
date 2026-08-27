/**
 * CatalogStage Tests (Add Integration flow — catalog picker stage)
 *
 * Presentational SINGLE-select tile gallery over the pre-built integration catalog.
 * Picking a tile selects exactly one (radio semantics — a re-pick switches); the search
 * header appears past the same threshold as the old catalog modal and filters across
 * name + description.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { CatalogStage } from '@/features/project-creation/ui/components/integration-flow/stages/CatalogStage';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

function entry(id: string, name: string, description?: string): AppBuilderComponentCatalogEntry {
    return {
        id,
        name,
        description: description ?? `${name} description`,
        kind: 'integration',
        source: { owner: 'o', repo: id, branch: 'main' },
    };
}

type Props = React.ComponentProps<typeof CatalogStage>;

function renderStage(props: Partial<Props> = {}): {
    onPick: jest.Mock;
    onInstanceChange: jest.Mock;
} {
    const onPick = jest.fn();
    const onInstanceChange = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <CatalogStage
                catalog={
                    props.catalog ?? [entry('acme-a', 'Widget A'), entry('acme-b', 'Widget B')]
                }
                selectedId={props.selectedId}
                onPick={onPick}
                reservedIds={props.reservedIds ?? new Set(['acme-a', 'acme-b', 'taken-id'])}
                instance={props.instance}
                onInstanceChange={onInstanceChange}
            />
        </Provider>
    );
    return { onPick, onInstanceChange };
}

/** Six entries — enough to cross the search threshold (> 5). */
function sixEntries(): AppBuilderComponentCatalogEntry[] {
    return [
        entry('acme-a', 'Widget A'),
        entry('acme-b', 'Widget B'),
        entry('acme-c', 'Gadget C'),
        entry('acme-d', 'Gadget D'),
        entry('acme-e', 'Gizmo E'),
        entry('acme-f', 'Gizmo F', 'special sauce'),
    ];
}

describe('CatalogStage', () => {
    it('renders a tile per catalog entry', () => {
        renderStage();
        expect(screen.getByRole('button', { name: /Widget A/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Widget B/ })).toBeInTheDocument();
    });

    it('marks only the selectedId tile as selected', () => {
        renderStage({ selectedId: 'acme-b' });
        expect(screen.getByRole('button', { name: /Widget B/ })).toHaveAttribute(
            'data-selected',
            'true'
        );
        expect(screen.getByRole('button', { name: /Widget A/ })).toHaveAttribute(
            'data-selected',
            'false'
        );
    });

    it('marks no tile selected when selectedId is undefined', () => {
        renderStage();
        expect(screen.getByRole('button', { name: /Widget A/ })).toHaveAttribute(
            'data-selected',
            'false'
        );
        expect(screen.getByRole('button', { name: /Widget B/ })).toHaveAttribute(
            'data-selected',
            'false'
        );
    });

    it('clicking a tile calls onPick with its id', () => {
        const { onPick } = renderStage();
        fireEvent.click(screen.getByRole('button', { name: /Widget A/ }));
        expect(onPick).toHaveBeenCalledWith('acme-a');
    });

    it('clicking another tile while one is selected calls onPick with the new id (switch)', () => {
        const { onPick } = renderStage({ selectedId: 'acme-a' });
        fireEvent.click(screen.getByRole('button', { name: /Widget B/ }));
        expect(onPick).toHaveBeenCalledWith('acme-b');
    });

    it('clicking the already-selected tile still calls onPick with its id (no deselect)', () => {
        const { onPick } = renderStage({ selectedId: 'acme-a' });
        fireEvent.click(screen.getByRole('button', { name: /Widget A/ }));
        expect(onPick).toHaveBeenCalledWith('acme-a');
    });

    it('hides the search field at or below the threshold', () => {
        renderStage({
            catalog: [
                entry('acme-a', 'Widget A'),
                entry('acme-b', 'Widget B'),
                entry('acme-c', 'Widget C'),
                entry('acme-d', 'Widget D'),
                entry('acme-e', 'Widget E'),
            ],
        });
        expect(screen.queryByTestId('spectrum-searchfield')).not.toBeInTheDocument();
    });

    it('shows the search field past the threshold', () => {
        renderStage({ catalog: sixEntries() });
        expect(screen.getByTestId('spectrum-searchfield')).toBeInTheDocument();
    });

    it('typing filters tiles by name (case-insensitive)', () => {
        renderStage({ catalog: sixEntries() });
        fireEvent.change(screen.getByTestId('spectrum-searchfield'), {
            target: { value: 'widget' },
        });
        expect(screen.getByRole('button', { name: /Widget A/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Widget B/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Gadget C/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Gizmo E/ })).not.toBeInTheDocument();
    });

    it('the filter matches descriptions too', () => {
        renderStage({ catalog: sixEntries() });
        fireEvent.change(screen.getByTestId('spectrum-searchfield'), {
            target: { value: 'special sauce' },
        });
        expect(screen.getByRole('button', { name: /Gizmo F/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Widget A/ })).not.toBeInTheDocument();
    });

    it('shows an empty-state message when no entries match the query', () => {
        renderStage({ catalog: sixEntries() });
        fireEvent.change(screen.getByTestId('spectrum-searchfield'), {
            target: { value: 'zzz-no-match' },
        });
        expect(screen.getByText(/No integrations match/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Widget A/ })).not.toBeInTheDocument();
    });

    it('shows the empty-state message for an empty catalog', () => {
        renderStage({ catalog: [] });
        expect(screen.getByText(/No integrations match/)).toBeInTheDocument();
    });
});

describe('naming a picked entry (2026-08-27 — the option to name pre-builts)', () => {
    it('shows NO name field until an entry is picked', () => {
        renderStage();
        expect(screen.queryByText('Integration name')).not.toBeInTheDocument();
    });

    it('prefills the field with the picked entry name and EMITS its instance on mount', () => {
        // The default name's slug is the entry's own id ('Widget A' → 'widget-a'
        // ≠ 'acme-a' here, so this fixture also proves the self-exclusion is by
        // ID, not by name): Continue must enable on pick with no typing.
        const { onInstanceChange } = renderStage({ selectedId: 'acme-a' });

        expect(screen.getByDisplayValue('Widget A')).toBeInTheDocument();
        expect(onInstanceChange).toHaveBeenCalledWith({ id: 'widget-a', name: 'Widget A' });
    });

    it('the picked entry cannot collide with ITSELF — a name slugging to its id is valid', () => {
        const kit = entry('widget-a', 'Widget A'); // name slugs to 'widget-a' = its own id
        const { onInstanceChange } = renderStage({
            catalog: [kit],
            selectedId: 'widget-a',
            reservedIds: new Set(['widget-a']),
        });

        expect(onInstanceChange).toHaveBeenCalledWith({ id: 'widget-a', name: 'Widget A' });
    });

    it('an edited name emits the NEW instance; a colliding one emits undefined + message', () => {
        const { onInstanceChange } = renderStage({ selectedId: 'acme-a' });
        const field = screen.getByDisplayValue('Widget A');

        fireEvent.change(field, { target: { value: 'Order Sync' } });
        expect(onInstanceChange).toHaveBeenLastCalledWith({ id: 'order-sync', name: 'Order Sync' });

        fireEvent.change(field, { target: { value: 'Taken Id' } });
        expect(onInstanceChange).toHaveBeenLastCalledWith(undefined);
        expect(screen.getByText(/already used/)).toBeInTheDocument();
    });
});

describe('node-version disclosure', () => {
    it('appends the install disclosure for entries that declare a nodeVersion', () => {
        renderStage({
            catalog: [
                {
                    id: 'kit',
                    name: 'Commerce Integration Starter Kit',
                    description: 'Sync scaffolding.',
                    kind: 'integration',
                    nodeVersion: '24',
                    source: { owner: 'adobe', repo: 'kit' },
                } as never,
            ],
        });

        expect(screen.getByText(/Installs Node 24 on first use/)).toBeInTheDocument();
    });
});
