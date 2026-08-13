/**
 * DatapackCard tests.
 *
 * The one genuinely new piece in the catalog slice: nothing else in the repo
 * renders an image. The art chain is cover → thumbnail → a CSS letter tile, and
 * every link in it is exercised here because real data uses all three:
 *
 *   - 8 of the 23 curated (`shared`) catalog entries carry a `cover_image`
 *   - all 23 carry a `thumbnail_image`
 *   - the community entries (the `aco_*` family) carry neither
 *
 * Art belongs to a VERSION, not to the pack — `bodea/main` has a cover while
 * `bodea/tierpricingfix` has only a thumbnail — so the picker changes the art,
 * and the fallback position must reset when it does.
 *
 * Spectrum comes from the repo-wide moduleNameMapper mock (jest.config.js), the
 * same way BrandGallery's suite takes it; no per-suite preamble is needed because
 * this tree renders only mocked primitives (Picker/Item/Text).
 *
 * Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DatapackCard } from '@/features/data-installer/ui/components/DatapackCard';
import type { DatapackGroup } from '@/features/data-installer/services/datapackCatalog';
import type { DatapackSummary } from '@/features/data-installer/types';

const COVER = 'https://example.invalid/Bodea-B2B.png';
const THUMB = 'https://example.invalid/300/200';

function makeVersion(overrides: Partial<DatapackSummary> = {}): DatapackSummary {
    return {
        id: { name: 'bodea', version: 'main' },
        displayName: 'Bodea',
        shared: true,
        dataTypes: ['categories', 'products'],
        art: { cover: COVER, thumbnail: THUMB },
        ...overrides,
    };
}

function makeGroup(overrides: Partial<DatapackGroup> = {}): DatapackGroup {
    return {
        name: 'bodea',
        displayName: 'Bodea',
        shared: true,
        versions: [makeVersion()],
        ...overrides,
    };
}

function renderCard(group: DatapackGroup, selectedVersion = group.versions[0].id.version) {
    const onVersionChange = jest.fn();
    const onOpen = jest.fn();
    const view = render(
        <DatapackCard
            group={group}
            selectedVersion={selectedVersion}
            onVersionChange={onVersionChange}
            onOpen={onOpen}
        />,
    );
    return { ...view, onVersionChange, onOpen, card: screen.getByTestId('datapack-card') };
}

describe('DatapackCard', () => {
    it('renders the display name', () => {
        renderCard(makeGroup());

        expect(screen.getByText('Bodea')).toBeInTheDocument();
    });

    it('renders the data-type count for the selected version', () => {
        renderCard(makeGroup());

        expect(screen.getByText('2 data types')).toBeInTheDocument();
    });

    it('renders the singular noun for a one-type version', () => {
        renderCard(makeGroup({ versions: [makeVersion({ dataTypes: ['products'] })] }));

        expect(screen.getByText('1 data type')).toBeInTheDocument();
    });

    describe('art chain', () => {
        it('renders the cover when the selected version has one', () => {
            const { card } = renderCard(makeGroup());

            expect(within(card).getByTestId('datapack-card-art')).toHaveAttribute('src', COVER);
        });

        it('falls back to the thumbnail when there is no cover', () => {
            const { card } = renderCard(
                makeGroup({ versions: [makeVersion({ art: { cover: '', thumbnail: THUMB } })] }),
            );

            expect(within(card).getByTestId('datapack-card-art')).toHaveAttribute('src', THUMB);
        });

        it('falls back to the thumbnail when the cover fails to load', () => {
            const { card } = renderCard(makeGroup());

            fireEvent.error(within(card).getByTestId('datapack-card-art'));

            expect(within(card).getByTestId('datapack-card-art')).toHaveAttribute('src', THUMB);
        });

        it('renders the letter tile when the version carries no art at all', () => {
            const { card } = renderCard(makeGroup({ versions: [makeVersion({ art: {} })] }));

            expect(within(card).queryByTestId('datapack-card-art')).not.toBeInTheDocument();
            expect(within(card).getByTestId('datapack-card-tile')).toHaveTextContent('B');
        });

        it('renders the letter tile once every candidate has failed', () => {
            const { card } = renderCard(makeGroup());

            fireEvent.error(within(card).getByTestId('datapack-card-art')); // cover
            fireEvent.error(within(card).getByTestId('datapack-card-art')); // thumbnail

            expect(within(card).queryByTestId('datapack-card-art')).not.toBeInTheDocument();
            expect(within(card).getByTestId('datapack-card-tile')).toBeInTheDocument();
        });

        // The webview CSP resolves img-src to [cspSource, https:, data:]
        // (`getWebviewHTML`'s `imgSources`). An http: URL is blocked
        // before the request, so it is dropped rather than rendered as a broken
        // image that only fixes itself via onError.
        it('skips an art URL the webview CSP cannot load', () => {
            const { card } = renderCard(
                makeGroup({
                    versions: [
                        makeVersion({
                            art: { cover: 'http://example.invalid/x.png', thumbnail: THUMB },
                        }),
                    ],
                }),
            );

            expect(within(card).getByTestId('datapack-card-art')).toHaveAttribute('src', THUMB);
        });
    });

    describe('version picker', () => {
        const multi = makeGroup({
            versions: [
                makeVersion({ id: { name: 'bodea', version: 'main' } }),
                makeVersion({
                    id: { name: 'bodea', version: 'tierpricingfix' },
                    art: { cover: '', thumbnail: THUMB },
                    dataTypes: ['products'],
                }),
            ],
        });

        it('offers every version of the pack, in the order the group carries', () => {
            const { card } = renderCard(multi);

            // The mock renders the options inside a display:none select, so they
            // are outside the accessibility tree — read the DOM, not the roles.
            const select = within(card).getByTestId('spectrum-picker-select');
            const values = Array.from(select.querySelectorAll('option')).map((o) => o.value);

            expect(values).toEqual(['main', 'tierpricingfix']);
        });

        it('reports a pick through onVersionChange', () => {
            const { card, onVersionChange } = renderCard(multi);

            fireEvent.change(within(card).getByTestId('spectrum-picker-select'), {
                target: { value: 'tierpricingfix' },
            });

            expect(onVersionChange).toHaveBeenCalledWith('tierpricingfix');
        });

        it('shows the selected version, not the first one', () => {
            const { card } = renderCard(multi, 'tierpricingfix');

            expect(within(card).getByTestId('spectrum-picker')).toHaveTextContent('tierpricingfix');
        });

        it('renders the SELECTED version art and data types', () => {
            const { card } = renderCard(multi, 'tierpricingfix');

            expect(within(card).getByTestId('datapack-card-art')).toHaveAttribute('src', THUMB);
            expect(within(card).getByText('1 data type')).toBeInTheDocument();
        });

        // A failed cover must not poison the next version's art: the fallback
        // position is per-version state, so switching versions starts over.
        it('retries from the top when the selected version changes', () => {
            const { card, rerender } = renderCard(multi);

            fireEvent.error(within(card).getByTestId('datapack-card-art'));
            expect(within(card).getByTestId('datapack-card-art')).toHaveAttribute('src', THUMB);

            rerender(
                <DatapackCard
                    group={multi}
                    selectedVersion="tierpricingfix"
                    onVersionChange={jest.fn()}
                    onOpen={jest.fn()}
                />,
            );
            rerender(
                <DatapackCard group={multi} selectedVersion="main" onVersionChange={jest.fn()} onOpen={jest.fn()} />,
            );

            expect(screen.getByTestId('datapack-card-art')).toHaveAttribute('src', COVER);
        });
    });

    // The card gained an open affordance with the detail drawer. It is a
    // div-role button, not a <button>, because it hosts the version Picker and a
    // control inside a button is invalid HTML and unreachable by keyboard — the
    // IntegrationCard precedent.
    describe('opening the detail', () => {
        it('is a keyboard-reachable button naming the pack', () => {
            const { card } = renderCard(makeGroup());

            expect(card).toHaveAttribute('role', 'button');
            expect(card).toHaveAttribute('tabindex', '0');
            expect(card).toHaveAttribute('aria-label', expect.stringContaining('Bodea'));
        });

        it.each([
            ['click', (card: HTMLElement) => fireEvent.click(card)],
            ['Enter', (card: HTMLElement) => fireEvent.keyDown(card, { key: 'Enter' })],
            ['Space', (card: HTMLElement) => fireEvent.keyDown(card, { key: ' ' })],
        ])('opens the detail on %s, carrying the selected version', (_label, activate) => {
            const { card, onOpen } = renderCard(makeGroup());

            activate(card);

            expect(onOpen).toHaveBeenCalledWith({ name: 'bodea', version: 'main' });
        });

        it('opens the VERSION the user picked, not the default', () => {
            const group = makeGroup({
                versions: [
                    makeVersion(),
                    makeVersion({ id: { name: 'bodea', version: 'tierpricingfix' } }),
                ],
            });
            const { card, onOpen } = renderCard(group, 'tierpricingfix');

            fireEvent.click(card);

            expect(onOpen).toHaveBeenCalledWith({ name: 'bodea', version: 'tierpricingfix' });
        });

        // Containment pin. Without it the picker's press bubbles to the card and
        // choosing a version also opens the drawer — the conflicting-nested-action
        // problem the integrations grid already hit.
        it('does NOT open the detail when the version picker is used', () => {
            const group = makeGroup({
                versions: [
                    makeVersion(),
                    makeVersion({ id: { name: 'bodea', version: 'tierpricingfix' } }),
                ],
            });
            const { card, onOpen, onVersionChange } = renderCard(group);

            fireEvent.click(within(card).getByTestId('spectrum-picker'));
            fireEvent.change(within(card).getByTestId('spectrum-picker-select'), {
                target: { value: 'tierpricingfix' },
            });

            expect(onVersionChange).toHaveBeenCalledWith('tierpricingfix');
            expect(onOpen).not.toHaveBeenCalled();
        });
    });

    describe('curation', () => {
        it('marks a community pack', () => {
            renderCard(makeGroup({ shared: false }));

            expect(screen.getByText('Community')).toBeInTheDocument();
        });

        it('leaves a curated pack unmarked', () => {
            renderCard(makeGroup());

            expect(screen.queryByText('Community')).not.toBeInTheDocument();
        });
    });
});
