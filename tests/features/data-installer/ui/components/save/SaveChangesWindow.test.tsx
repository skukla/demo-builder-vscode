/**
 * "Save Changes to My Luma" (step-04 S2; decisions Phase 7b, J3-1; P4-Q3): the check's wait, then
 * what My Luma will hold, read-only, one row per type, with "N changed" on a type the SC changed
 * ("2,046, 4 changed"), and no line above the table. Review Records opens the same spot check as an
 * install's, Back only. Cancel and Save; Save hands on to the run.
 *
 * Counts come from what the install record lists (`get-datapack-removal-scope`), the changes from
 * the changes check (`get-datapack-removal-changes`). Records added by hand since the install show
 * only once saved (P4-Q3): neither read sees them.
 *
 * Ported from `SaveFromStoreModal.test.tsx` for what is still true of Save Changes: its title names
 * the datapack, nothing is ticked, Save hands on with nothing picked, Cancel closes.
 */

import '../../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { press, settle } from '../../../../../helpers/reactSettle';

// Below the mock on purpose (webview-test-authoring §3).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type {
    DatapackRemovalChanges,
    DatapackRemovalScope,
} from '@/features/data-installer/removalChanges';
import type { PackBeingSaved } from '@/features/data-installer/ui/components/save/packBeingSaved';
import { SaveChangesWindow } from '@/features/data-installer/ui/components/save/SaveChangesWindow';
import type { DatapackRecordsResult } from '@/types/webviewRequests';

const mockRequest = webviewClient.request as jest.Mock;

const MY_LUMA: PackBeingSaved = {
    id: { name: 'my-luma-1a2b3c', version: '20261110-091500' },
    displayName: 'My Luma',
    source: 'library',
};
const SCOPE: DatapackRemovalScope = {
    kinds: [
        { kind: 'categories', count: 41 },
        { kind: 'products', count: 2046 },
    ],
};
const CHANGES: DatapackRemovalChanges = {
    count: 4,
    kinds: [{ kind: 'products', count: 4, names: ['24-MB01'] }],
    packName: 'My Luma',
    alwaysSave: false,
};
const RECORDS: DatapackRecordsResult = {
    records: { categories: ['Gear', 'Gear/Bags'], products: ['24-MB01', '24-MB02'] },
};

interface Answers {
    scope: unknown;
    changes: unknown;
    records: unknown;
}

const ANSWERS: Answers = {
    scope: { success: true, data: SCOPE },
    changes: { success: true, data: CHANGES },
    records: { success: true, data: RECORDS },
};

function answer(over: Partial<Answers> = {}, never: string[] = []): void {
    const a = { ...ANSWERS, ...over };
    mockRequest.mockReset();
    mockRequest.mockImplementation(async (type: string) => {
        if (never.includes(type)) return new Promise(() => undefined);
        if (type === 'get-datapack-removal-scope') return a.scope;
        if (type === 'get-datapack-removal-changes') return a.changes;
        if (type === 'get-datapack-records') return a.records;
        return { success: true, data: null };
    });
}

const sent = (type: string): unknown => mockRequest.mock.calls.find((c) => c[0] === type)?.[1];
const sends = (type: string): number => mockRequest.mock.calls.filter((c) => c[0] === type).length;
const button = (name: string) => screen.getByRole('button', { name });
const rows = () =>
    within(screen.getByRole('table'))
        .getAllByRole('row')
        .map((row) => row.textContent);

async function open(pack: PackBeingSaved = MY_LUMA) {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(<SaveChangesWindow pack={pack} onSave={onSave} onClose={onClose} />);
    await settle();
    await settle();
    return { onSave, onClose };
}

describe('the check', () => {
    it('waits on both reads under the title, offering only Cancel, and reads each once for the datapack in its store', async () => {
        answer({}, ['get-datapack-removal-changes']);
        await open();

        expect(
            screen.getByRole('heading', { name: 'Save Changes to My Luma' })
        ).toBeInTheDocument();
        expect(screen.getAllByText('Checking for your changes').length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
        expect(sent('get-datapack-removal-scope')).toEqual({
            datapackName: 'my-luma-1a2b3c',
            version: '20261110-091500',
        });
        expect(sent('get-datapack-removal-changes')).toEqual({
            datapackName: 'my-luma-1a2b3c',
            version: '20261110-091500',
            source: 'library',
        });
        expect(sends('get-datapack-removal-changes')).toBe(1);
    });

    it('names no store for a datapack the Data Installer holds', async () => {
        answer();
        await open({ ...MY_LUMA, source: 'installer' });

        expect(sent('get-datapack-removal-changes')).toEqual({
            datapackName: 'my-luma-1a2b3c',
            version: '20261110-091500',
        });
    });

    it('Cancel during the check closes the window, saving nothing', async () => {
        answer({}, ['get-datapack-removal-changes']);
        const { onClose, onSave } = await open();

        await press(button('Cancel'));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSave).not.toHaveBeenCalled();
    });
});

describe('the summary', () => {
    it('lists what My Luma will hold, one row per type, "N changed" only where something changed, with no line above it', async () => {
        answer();
        await open();

        expect(rows()).toStrictEqual(['Categories41', 'Products2,046, 4 changed']);
        expect(document.querySelector('.lead-text')).toBeNull();
        expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('offers Review Records at the start, then Cancel and Save, and no Save As New', async () => {
        answer();
        await open();

        expect(button('Review Records')).toBeInTheDocument();
        expect(button('Cancel')).toBeInTheDocument();
        expect(button('Save')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Save As New' })).toBeNull();
        expect(screen.queryByRole('button', { name: /Add Unused Items/u })).toBeNull();
    });

    it('lists a changed type the record does not count on a row of its own', async () => {
        answer({
            changes: {
                success: true,
                data: {
                    ...CHANGES,
                    count: 2,
                    kinds: [{ kind: 'attribute_options', count: 2, names: [] }],
                },
            },
        });
        await open();

        expect(rows()).toStrictEqual([
            'Categories41',
            'Products2,046',
            'Attribute Options2 changed',
        ]);
    });

    it('says when what the datapack holds could not be read, and still offers Save', async () => {
        answer({ scope: { success: false, error: 'The record could not be read.' } });
        await open();

        expect(
            screen.getByText("What the datapack installed couldn't be read.")
        ).toBeInTheDocument();
        expect(button('Save')).toBeInTheDocument();
    });

    it('says when the changes could not be checked, and still offers Save', async () => {
        answer({ changes: { success: false, error: 'Commerce could not be read.' } });
        await open();

        expect(rows()).toStrictEqual(['Categories41', 'Products2,046']);
        expect(screen.getByText("Your changes couldn't be checked.")).toBeInTheDocument();
        expect(button('Save')).toBeInTheDocument();
    });
});

describe('Save and Cancel', () => {
    it('Save hands on to the run, once', async () => {
        answer();
        const { onSave, onClose } = await open();

        await press(button('Save'));

        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('Cancel closes, saving nothing', async () => {
        answer();
        const { onSave, onClose } = await open();

        await press(button('Cancel'));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onSave).not.toHaveBeenCalled();
    });
});

describe('Review Records', () => {
    it("reads the datapack's records once, lists them read-only with Back alone, and Back returns to the summary", async () => {
        answer();
        await open();

        await press(button('Review Records'));
        await settle();

        expect(sent('get-datapack-records')).toEqual({
            datapackName: 'my-luma-1a2b3c',
            version: '20261110-091500',
            source: 'library',
        });
        expect(
            screen.getByRole('heading', { name: 'Save Changes to My Luma' })
        ).toBeInTheDocument();
        expect(screen.getByText('Gear/Bags')).toBeInTheDocument();
        expect(
            screen
                .getAllByRole('button', { name: /^(Back|Cancel|Close|Save)$/u })
                .map((b) => b.textContent)
        ).toEqual(['Back']);

        await press(button('Back'));
        expect(rows()).toStrictEqual(['Categories41', 'Products2,046, 4 changed']);
        await press(button('Review Records'));
        expect(sends('get-datapack-records')).toBe(1);
    });
});
