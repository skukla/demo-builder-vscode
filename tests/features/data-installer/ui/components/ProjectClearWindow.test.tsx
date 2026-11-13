/**
 * "Clear <Project> Demo Data?", the project's Clear window as J1 walked it (datapack-simplification
 * step 06, C2b; `mockups/flow/j1-windows.tsx`): no picker; the lead names the project's websites,
 * the summary is the type table, and the red "Clear N Items" hands the shown list's token to the
 * screen. A type the check could not read is split by kind (P6-Q3): slow is Retry then Fix with AI,
 * and Clear waits; refused is Open Commerce Admin and strange is Fix with AI, and Clear runs for the
 * rest. The whole check failing is the Datapacks failure treatment. Every request is asserted by its
 * payload, because the handler decides on those fields.
 */

import { screen } from '@testing-library/react';
import { BODEA_CHECK, EMPTY_CHECK } from '../../../../helpers/clearCheckFixtures';
import {
    answering,
    button,
    footer,
    mockRequest,
    openWindow,
    press,
    sent,
} from './ProjectClearWindow.testUtils';
import { RETRIES_BEFORE_FIX } from '@/features/data-installer/ui/components/importResult';
import type { ClearCheck } from '@/types/demoDataWipe';
import { ErrorCode } from '@/types/errorCodes';

/** Bodea with one type Commerce could not read, of the kind given. */
function unreadCheck(kind: 'slow' | 'refused' | 'strange'): ClearCheck {
    return {
        ...BODEA_CHECK,
        rows: [
            ...BODEA_CHECK.rows,
            { type: 'companies', label: 'Companies', count: 0, happens: "Couldn't be read" },
        ],
        records: { ...BODEA_CHECK.records, companies: { removed: [], kept: [] } },
        unread: { companies: kind },
        ...(kind === 'slow' ? { problem: "Commerce didn't answer for Companies." } : {}),
    };
}

const summaryRows = (): string[][] =>
    Array.from(document.querySelectorAll('.type-row')).map((row) => [
        row.querySelector('[role="rowheader"]')?.textContent ?? '',
        row.querySelector('[role="cell"]')?.textContent ?? '',
    ]);

beforeEach(() => answering(BODEA_CHECK));

describe('the summary', () => {
    it('asks once, naming no stores: the handler covers every website the project uses', async () => {
        await openWindow();

        expect(sent('check-demo-data')).toEqual([{}]);
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('is titled by the project, as a question', async () => {
        await openWindow();

        expect(screen.getByRole('heading', { name: 'Clear Bodea Demo Data?' })).toBeInTheDocument();
    });

    it("names the project's website in its lead, and that another demo's records stay", async () => {
        await openWindow();

        expect(
            screen.getByText(
                'Clears Bodea, the website this demo uses. Anything another demo uses is kept.'
            )
        ).toBeInTheDocument();
    });

    it('names every website when the project uses several', async () => {
        answering({
            ...BODEA_CHECK,
            websites: [
                { code: 'bodea', name: 'Bodea' },
                { code: 'bodea_eu', name: 'Bodea EU' },
            ],
        });

        await openWindow();

        expect(
            screen.getByText(
                'Clears Bodea and Bodea EU, the websites this demo uses. Anything another demo uses is kept.'
            )
        ).toBeInTheDocument();
    });

    it('is the type table: one row per type, its name and what happens, and no names', async () => {
        await openWindow();

        expect(
            screen.getByRole('table', { name: 'What happens to each type of data' })
        ).toBeInTheDocument();
        expect(summaryRows()).toEqual([
            ['Products', '2 removed'],
            ['Categories', '2 removed'],
            ['Customers', '1 removed'],
            ['Orders', '3 closed'],
        ]);
        expect(screen.queryByText('BD-RACK')).not.toBeInTheDocument();
    });

    it('offers Review Records, Cancel and a red Clear with its count, in that order', async () => {
        await openWindow();

        expect(footer()).toEqual(['Review Records', 'Cancel', 'Clear 8 Items']);
        expect(button('Clear 8 Items')).toHaveClass('modal-button-negative');
    });

    it('clears nothing until Clear is pressed, then hands the shown list’s token and its websites to the screen', async () => {
        const { onClear } = await openWindow();
        expect(onClear).not.toHaveBeenCalled();

        await press(button('Clear 8 Items'));

        expect(onClear).toHaveBeenCalledWith('tok-1', ['bodea']);
        expect(sent('clear-demo-data')).toStrictEqual([]);
    });

    it('says another project uses the website as a notice, and still offers the clearing (P6-Q2)', async () => {
        const warning =
            'The project Neighbour also uses the website bodea. Clearing it also removes what was added there by hand for that project.';
        answering({ ...BODEA_CHECK, warning });

        await openWindow();

        expect(screen.getByText(warning)).toBeInTheDocument();
        expect(button('Clear 8 Items')).not.toHaveAttribute('aria-disabled', 'true');
    });

    it("says the project's datapack is left for its uninstall, when the check names one", async () => {
        answering({ ...BODEA_CHECK, datapack: { name: 'Bodea B2B', changes: 'unchecked' } });

        await openWindow();

        expect(
            screen.getByText('What the datapack Bodea B2B installed is left for its uninstall.')
        ).toBeInTheDocument();
    });

    it('says there is nothing to clear, and offers no clearing and no records', async () => {
        answering(EMPTY_CHECK);

        await openWindow();

        expect(screen.getByText('Nothing to clear on these websites.')).toBeInTheDocument();
        expect(button('Clear')).toHaveAttribute('aria-disabled', 'true');
        expect(screen.queryByRole('button', { name: 'Review Records' })).not.toBeInTheDocument();
    });

    it('waits saying what it reads while it reads', async () => {
        mockRequest.mockReset();
        mockRequest.mockImplementation(() => new Promise(() => undefined));

        await openWindow();

        expect(screen.getAllByText('Reading demo data').length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: /^Clear/ })).not.toBeInTheDocument();
    });
});

describe('a type Commerce was too slow to answer', () => {
    it('marks its row, says so on the problem line, offers Retry and holds Clear', async () => {
        answering(unreadCheck('slow'));

        const { onClear } = await openWindow();

        expect(summaryRows()).toContainEqual(['Companies', "Couldn't be read"]);
        expect(screen.getByText("Commerce didn't answer for Companies.")).toHaveClass(
            'dialog-problem',
            'text-notice'
        );
        expect(footer()).toEqual(['Review Records', 'Cancel', 'Retry', 'Clear 8 Items']);
        expect(button('Clear 8 Items')).toHaveAttribute('aria-disabled', 'true');
        await press(button('Clear 8 Items'));
        expect(onClear).not.toHaveBeenCalled();
    });

    it('asks again on Retry, and offers Clear once every type answers', async () => {
        answering(unreadCheck('slow'), BODEA_CHECK);
        await openWindow();

        await press(button('Retry'));

        expect(sent('check-demo-data')).toEqual([{}, {}]);
        expect(button('Clear 8 Items')).not.toHaveAttribute('aria-disabled', 'true');
        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });

    it('offers Fix with AI instead of Retry once retrying has not helped, opening it on the recorded check', async () => {
        answering(unreadCheck('slow'));
        await openWindow();

        for (let i = 0; i < RETRIES_BEFORE_FIX; i++) await press(button('Retry'));

        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
        expect(button('Clear 8 Items')).toHaveAttribute('aria-disabled', 'true');
        await press(button('Fix with AI'));
        expect(sent('fix-datapack-import-with-ai')).toEqual([{ from: 'clear-check' }]);
    });
});

describe('a type Commerce refused to read', () => {
    it('marks its row, offers Open Commerce Admin, and clears the rest', async () => {
        answering(unreadCheck('refused'));
        const { onClear } = await openWindow();

        expect(summaryRows()).toContainEqual(['Companies', "Couldn't be read"]);
        expect(footer()).toEqual([
            'Review Records',
            'Cancel',
            'Open Commerce Admin',
            'Clear 8 Items',
        ]);
        await press(button('Open Commerce Admin'));
        expect(sent('open-commerce-admin')).toHaveLength(1);

        await press(button('Clear 8 Items'));
        expect(onClear).toHaveBeenCalledWith('tok-1', ['bodea']);
    });

    it("says why on the problem line when the Admin can't be opened", async () => {
        answering(unreadCheck('refused'));
        const check = mockRequest.getMockImplementation();
        mockRequest.mockImplementation(async (type: string, payload: unknown) =>
            type === 'open-commerce-admin'
                ? { success: false, error: 'No Admin Panel URL is set for this project.' }
                : check?.(type, payload)
        );
        await openWindow();

        await press(button('Open Commerce Admin'));

        expect(screen.getByText('No Admin Panel URL is set for this project.')).toHaveClass(
            'dialog-problem'
        );
    });
});

describe('a type Commerce answered strangely', () => {
    it('marks its row, offers Fix with AI on the recorded check, and clears the rest', async () => {
        answering(unreadCheck('strange'));
        const { onClear } = await openWindow();

        expect(summaryRows()).toContainEqual(['Companies', "Couldn't be read"]);
        expect(footer()).toEqual(['Review Records', 'Cancel', 'Fix with AI', 'Clear 8 Items']);
        await press(button('Fix with AI'));
        expect(sent('fix-datapack-import-with-ai')).toEqual([{ from: 'clear-check' }]);

        await press(button('Clear 8 Items'));
        expect(onClear).toHaveBeenCalledWith('tok-1', ['bodea']);
    });
});

describe('the whole check failing', () => {
    it('is the Datapacks failure treatment, titled by Commerce, with Retry and no clearing', async () => {
        mockRequest.mockReset();
        mockRequest.mockResolvedValue({
            success: false,
            error: "What this project's websites hold could not be read. Details are in Debug Logs.",
            code: ErrorCode.NETWORK,
        });

        await openWindow();

        expect(screen.getByText("Couldn't Reach Commerce")).toBeInTheDocument();
        expect(
            screen.getByText(
                "What this project's websites hold could not be read. Details are in Debug Logs."
            )
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Clear/ })).not.toBeInTheDocument();
        await press(button('Retry'));
        expect(sent('check-demo-data')).toEqual([{}, {}]);
    });

    it('offers Sign In, never Retry, when signed out', async () => {
        mockRequest.mockReset();
        mockRequest.mockResolvedValue({
            success: false,
            error: 'Adobe authentication is required.',
            code: ErrorCode.AUTH_REQUIRED,
        });

        await openWindow();

        expect(button('Sign In with Adobe')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });
});
