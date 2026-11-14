/**
 * The Demo Builder mark on the screen (owner, 2026-11-14; rule 1, reversibility).
 *
 * In the Datapack Library, the SC's own Demo Builder datapack offers Remove Demo Builder Mark, and
 * their own other datapack Mark as Demo Builder Datapack, since no screen could mark one before
 * (only the agent tool). Each asks in the house confirm window, in blue (it deletes nothing, rule
 * 20), and calls the same handler the agent tool does. A project's Datapacks offers neither: the
 * flyout shows the rows only when it is handed `onMarkChanged`, which only the Library hands it.
 */

import { makeDetail, menuLabels, mockRequest, resetRequests, row } from './PackActions.testUtils';
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press, settle } from '../../../../helpers/reactSettle';

// Below the shared setup on purpose: it registers the channel mock.
import type { DatapackDetail } from '@/features/data-installer/types';
import { PackActions } from '@/features/data-installer/ui/components/PackActions';

const OWN: DatapackDetail = makeDetail({ store: 'library', mine: true });
const OWN_DEMO_BUILDER: DatapackDetail = { ...OWN, team: true };

function renderInLibrary(detail: DatapackDetail, onMarkChanged = jest.fn()) {
    render(
        <PackActions
            detail={detail}
            onRemoved={jest.fn()}
            installerOn={false}
            onMarkChanged={onMarkChanged}
        />
    );
    return onMarkChanged;
}

beforeEach(resetRequests);

describe('Remove Demo Builder Mark', () => {
    it("sits in More on the SC's own Demo Builder datapack, with no Delete", () => {
        renderInLibrary(OWN_DEMO_BUILDER);
        expect(menuLabels()).toEqual(['Save as File', 'Stop Sharing', 'Remove Demo Builder Mark']);
    });

    it('asks first, and takes the mark off only when the window says so', async () => {
        mockRequest.mockResolvedValue({
            success: true,
            data: { datapackName: 'bodea', team: false, versions: 1 },
        });
        const onMarkChanged = renderInLibrary(OWN_DEMO_BUILDER);

        await press(row('Remove Demo Builder Mark'));
        expect(
            screen.getByRole('heading', { name: 'Remove the Demo Builder Mark?' })
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'Bodea goes back to being a regular datapack in the library, and can be deleted.'
            )
        ).toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalled();

        await press(screen.getByRole('button', { name: 'Remove Mark' }));
        expect(mockRequest).toHaveBeenCalledWith(
            'mark-team-datapack',
            { datapackName: 'bodea', team: false },
            undefined
        );
        await settle();
        expect(onMarkChanged).toHaveBeenCalled();
    });

    it('changes nothing on Cancel', async () => {
        renderInLibrary(OWN_DEMO_BUILDER);

        await press(row('Remove Demo Builder Mark'));
        await press(screen.getByRole('button', { name: 'Cancel' }));

        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('says why when the store refuses, with the actions back', async () => {
        mockRequest.mockResolvedValue({
            success: false,
            error: 'Only team pack owners can do this.',
        });
        renderInLibrary(OWN_DEMO_BUILDER);

        await press(row('Remove Demo Builder Mark'));
        await press(screen.getByRole('button', { name: 'Remove Mark' }));

        expect(
            await screen.findByText(
                "The mark couldn't be removed: Only team pack owners can do this."
            )
        ).toBeInTheDocument();
        expect(row('Remove Demo Builder Mark')).toBeInTheDocument();
    });
});

describe('Mark as Demo Builder Datapack', () => {
    it("sits in More on the SC's own other datapack, beside Delete", () => {
        renderInLibrary(OWN);
        expect(menuLabels()).toEqual([
            'Save as File',
            'Stop Sharing',
            'Mark as Demo Builder Datapack',
            'Delete',
        ]);
    });

    it('asks first, then marks it', async () => {
        mockRequest.mockResolvedValue({
            success: true,
            data: { datapackName: 'bodea', team: true, versions: 1 },
        });
        const onMarkChanged = renderInLibrary(OWN);

        await press(row('Mark as Demo Builder Datapack'));
        expect(
            screen.getByRole('heading', { name: 'Mark as a Demo Builder Datapack?' })
        ).toBeInTheDocument();
        await press(screen.getByRole('button', { name: 'Mark' }));

        expect(mockRequest).toHaveBeenCalledWith(
            'mark-team-datapack',
            { datapackName: 'bodea', team: true },
            undefined
        );
        await settle();
        expect(onMarkChanged).toHaveBeenCalled();
    });
});

describe("outside the Datapack Library, or on a colleague's datapack", () => {
    it("offers no mark row in a project's Datapacks", () => {
        render(
            <PackActions
                detail={OWN_DEMO_BUILDER}
                onImport={jest.fn()}
                onRemoved={jest.fn()}
                installerOn={false}
            />
        );
        expect(menuLabels()).toEqual(['Save as File', 'Stop Sharing']);
    });

    it("offers no mark row on a colleague's Demo Builder datapack", () => {
        renderInLibrary({ ...OWN_DEMO_BUILDER, mine: false });
        expect(menuLabels()).toEqual(['Save as File']);
    });
});
