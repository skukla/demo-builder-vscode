/**
 * The datapack list's empty state says where a datapack comes from on the screen it is on (release
 * test 1.10, 2026-11-16): a project's Datapacks said "Add one from a file." while its only buttons
 * were Install from File and Save As New, the library's wording on a screen without that button.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DatapackCatalogGrid } from '@/features/data-installer/ui/components/DatapackCatalogGrid';

function renderEmpty(library: boolean): void {
    render(
        <DatapackCatalogGrid
            groups={[]}
            filtered={[]}
            show="yours"
            onShow={jest.fn()}
            query=""
            versions={{}}
            pickVersion={jest.fn()}
            openDetail={jest.fn()}
            library={library}
        />,
    );
}

describe('an empty datapack list', () => {
    it("in the Datapack Library, points at its Add from File", () => {
        renderEmpty(true);

        expect(screen.getByText('Add one from a file.')).toBeInTheDocument();
    });

    it("on a project's Datapacks, points at what that screen offers", () => {
        renderEmpty(false);

        expect(screen.getByText("Make one from this demo's data, or install one from a file.")).toBeInTheDocument();
        expect(screen.queryByText('Add one from a file.')).not.toBeInTheDocument();
    });
});
