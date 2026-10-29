/**
 * "Needs reset" on the projects list, in the card and the row: shown only for a storefront
 * behind how Demo Builder builds storefronts now (`storefrontChanges.ts`). It takes the place of
 * the status that says all is well ("Deployed" on the card, "Published" on the row), which says
 * nothing once a reset is due (owner, 2026-10-23); anything worse keeps its own words. It has no
 * action of its own: Reset is in the tile's menu.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ProjectCard } from '@/features/projects-dashboard/ui/components/ProjectCard';
import { ProjectRow } from '@/features/projects-dashboard/ui/components/ProjectRow';
import type { Project } from '@/types/base';
import { createProjectsDashboardProject } from '../../testUtils';

const LINE = "Demo Builder has fixes this storefront doesn't have yet.";

/** An EDS project built on `builtThrough` (none: falls back to its creation date). */
function storefront(
    created: Date,
    builtThrough?: string,
    status: Project['status'] = 'ready',
    published: Project['edsStorefrontStatusSummary'] = 'published',
): Project {
    return createProjectsDashboardProject({
        name: 'justrite',
        // JustRite's own stack, read from its manifest: the row's status depends on it.
        selectedStack: 'eds-accs',
        status,
        created,
        edsStorefrontStatusSummary: published,
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'Storefront',
                status: 'ready',
                metadata: builtThrough ? { storefrontBuiltThrough: builtThrough } : {},
            },
        },
    });
}

const BEHIND = storefront(new Date('2026-01-01T00:00:00Z'));
const CURRENT = storefront(new Date('2026-01-01T00:00:00Z'), '2999-01-01');

const TILES = [
    ['card', ProjectCard],
    ['row', ProjectRow],
] as const;

function renderTile(Tile: (typeof TILES)[number][1], project: Project, onSelect = jest.fn(), onResetProject = jest.fn()) {
    render(
        <Provider theme={defaultTheme} colorScheme="light">
            <Tile project={project} onSelect={onSelect} actions={{ onResetProject }} />
        </Provider>,
    );
    return { onSelect, onResetProject };
}

/** What each tile says when all is well, which "Needs reset" takes the place of. */
const ALL_WELL = { card: 'Deployed', row: 'Published' } as const;

describe.each(TILES)('the project %s', (name, Tile) => {
    it('says "Needs reset", with its one line on hover, in place of all-is-well', () => {
        renderTile(Tile, BEHIND);

        expect(screen.getByText('Needs reset')).toBeInTheDocument();
        expect(screen.queryByText(ALL_WELL[name])).not.toBeInTheDocument();
        expect(screen.getByText('Needs reset').closest('[title]')).toHaveAttribute('title', LINE);
        expect(screen.getByRole('button', { name: /justrite.*Needs reset/ })).toBeInTheDocument();
    });

    it('says all is well, and nothing about a reset, for a current storefront', () => {
        renderTile(Tile, CURRENT);

        expect(screen.getByText(ALL_WELL[name])).toBeInTheDocument();
        expect(screen.queryByText('Needs reset')).not.toBeInTheDocument();
    });

    // A storefront that needs republishing says so first; the reset waits its turn.
    it('keeps a worse status in its own words', () => {
        renderTile(Tile, storefront(new Date('2026-01-01T00:00:00Z'), undefined, 'ready', 'stale'));

        expect(screen.queryByText('Needs reset')).not.toBeInTheDocument();
        expect(screen.queryByText(ALL_WELL[name])).not.toBeInTheDocument();
    });

    // Reset lives in the tile's menu; a link beside the status was taken out (owner,
    // 2026-10-23). A press on the status is a press on the tile: it opens the project.
    it('offers no reset of its own, and a press on it opens the project', () => {
        const { onSelect, onResetProject } = renderTile(Tile, BEHIND);

        fireEvent.click(screen.getByText('Needs reset'));

        expect(onSelect).toHaveBeenCalledWith(BEHIND);
        expect(onResetProject).not.toHaveBeenCalled();
    });

    it('says nothing while the project is being created', () => {
        renderTile(Tile, storefront(new Date('2026-01-01T00:00:00Z'), undefined, 'creating'));
        expect(screen.queryByText('Needs reset')).not.toBeInTheDocument();
    });

    // Found 2026-10-28: three projects reset from their menus at once all still said
    // "Needs reset" for the whole run. The reset is what was asked for; say so instead.
    it('says "Resetting", and nothing about a reset being due, while one runs', () => {
        renderTile(Tile, storefront(new Date('2026-01-01T00:00:00Z'), undefined, 'resetting'));

        expect(screen.getByText('Resetting')).toBeInTheDocument();
        expect(screen.queryByText('Needs reset')).not.toBeInTheDocument();
    });

    // Found 2026-10-29: Bodea's card read "Resetting" with "Deployed" under it. What is
    // deployed is in flux until the work ends, so the work in flight is the only line.
    it.each(['creating', 'resetting', 'republishing'] as const)(
        'says nothing about what is deployed while %s',
        (status) => {
            renderTile(Tile, storefront(new Date('2026-01-01T00:00:00Z'), '2999-01-01', status));

            expect(screen.queryByText('Deployed')).not.toBeInTheDocument();
            expect(screen.queryByText('Published')).not.toBeInTheDocument();
        },
    );

    it('says "Republishing" while a republish runs', () => {
        renderTile(Tile, storefront(new Date('2026-01-01T00:00:00Z'), undefined, 'republishing'));

        expect(screen.getByText('Republishing')).toBeInTheDocument();
        expect(screen.queryByText('Needs reset')).not.toBeInTheDocument();
    });
});
