/**
 * The datapack job window (step 03, S4): a first install, one window per phase, in ONE dialog
 * container. Check wait, then the type table; Review Records (Back only); Dry Run's own small
 * window; the run; the small result that closes itself, or "Couldn't Install Bodea" with Retry. A
 * window opened on a running job starts at its run, titled by what the job is for.
 *
 * Ported from `ImportDatapackModal.test.tsx`, `.targeting`, `-decisions` and `.lifecycle` for the
 * path that moved here: the project's instance and scope sent verbatim, a library pack naming its
 * store, the refusal shown verbatim, the result keyed on the last action, Run in Background, and
 * no instance. What those suites pin about the form (checkboxes, pickers) stays with the old
 * window, which still serves a switch, a reinstall and Uninstall.
 */

import { act, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    answer,
    mockPostMessage,
    mockRequest,
    press,
    record,
    renderWindow,
    sends,
    sent,
    settle,
    PROJECT_SCOPE,
} from './DatapackJobWindow.testUtils';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { windowRoute } from '@/features/data-installer/ui/hooks/useImportWindow';

const button = (name: string) => screen.getByRole('button', { name });
const heading = (name: string) => screen.findByRole('heading', { name });

/** Open the window and let the check answer. */
async function openOnSummary(over: Parameters<typeof renderWindow>[0] = {}) {
    const view = renderWindow(over);
    await settle();
    await settle();
    return view;
}

beforeEach(() => {
    answer();
    mockPostMessage.mockClear();
});

it('hosts itself in a DialogContainer: a bare Dialog renders nothing', async () => {
    renderWindow();
    await settle();

    expect(screen.getAllByTestId('spectrum-dialog-container')).toHaveLength(1);
});

describe('the check', () => {
    it('waits on the house wait while the check reads Commerce, with only the way out', async () => {
        answer({}, ['preview-datapack-changes']);
        renderWindow();
        await settle();

        expect(screen.getAllByText('Reading from Commerce').length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
        expect(sent('preview-datapack-changes')).toEqual({
            datapackName: 'bodea',
            version: 'main',
        });
    });

    it('checks a library pack in the library', async () => {
        renderWindow({ source: 'library' });
        await settle();

        expect(sent('preview-datapack-changes')).toEqual({
            datapackName: 'bodea',
            version: 'main',
            source: 'library',
        });
    });
});

describe('the summary', () => {
    it('is the type table: each type and its count, bare or added and updated', async () => {
        await openOnSummary();

        expect(await heading('Install Bodea')).toBeInTheDocument();
        const table = screen.getByRole('table');
        expect(within(table).getByRole('row', { name: /Categories/ })).toHaveTextContent('21');
        expect(within(table).getByRole('row', { name: /Products/ })).toHaveTextContent(
            '53 added, 3 updated'
        );
        expect(button('Review Records')).toBeInTheDocument();
        expect(button('Dry Run')).toBeInTheDocument();
        expect(button('Install')).toBeInTheDocument();
        expect(button('Cancel')).toBeInTheDocument();
    });

    it("offers no checkbox and no picker: the whole datapack goes to the project's store", async () => {
        await openOnSummary();

        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(screen.queryAllByTestId('spectrum-picker-select')).toHaveLength(0);
    });

    it('says when what installing changes could not be read, and still offers Install', async () => {
        answer({ preview: { success: false, error: 'Commerce did not answer.' } });
        await openOnSummary();

        expect(
            screen.getByText("What installing would change couldn't be read.")
        ).toBeInTheDocument();
        expect(button('Install')).toBeInTheDocument();
    });

    it('says so when the project names no Commerce instance, instead of a dead summary', async () => {
        answer({ target: { success: true, data: { projectName: 'demo-1' } } });
        await openOnSummary();

        expect(await heading('No Commerce Instance')).toBeInTheDocument();
        expect(screen.getByText(/Connect Commerce on the project dashboard/)).toBeInTheDocument();
        expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Close']);
    });
});

describe('Review Records', () => {
    it("lists the chosen type's records, read-only, with Back alone, and Back returns to the summary", async () => {
        await openOnSummary();

        await press(button('Review Records'));

        expect(sent('get-datapack-records')).toEqual({ datapackName: 'bodea', version: 'main' });
        expect(screen.getByText('Lab Equipment/Centrifuges')).toBeInTheDocument();
        await press(screen.getByRole('button', { name: /^Products/ }));
        expect(screen.getByText('BD-GLOVES')).toBeInTheDocument();
        expect(
            screen
                .getAllByRole('button', { name: /^(Back|Cancel|Close|Install)$/ })
                .map((b) => b.textContent)
        ).toEqual(['Back']);

        await press(button('Back'));

        expect(await heading('Install Bodea')).toBeInTheDocument();
        expect(screen.getByRole('table')).toBeInTheDocument();
    });
});

describe('Install', () => {
    it("sends the whole datapack to the project's instance and scope, verbatim", async () => {
        await openOnSummary();

        await press(button('Install'));

        expect(sent('start-datapack-import')).toEqual({
            datapackName: 'bodea',
            version: 'main',
            commerceInstance: 'inst',
            dataTypes: ['categories', 'products'],
            ...PROJECT_SCOPE,
        });
    });

    it('names the library as the store of a library pack', async () => {
        await openOnSummary({ source: 'library' });

        await press(button('Install'));

        expect(sent('start-datapack-import')).toMatchObject({
            datapackName: 'bodea',
            source: 'library',
        });
    });

    it('sends no scope when the project recorded none', async () => {
        answer({ target: { success: true, data: { instance: 'inst', projectName: 'demo-1' } } });
        await openOnSummary();

        await press(button('Install'));

        expect(sent('start-datapack-import')).not.toHaveProperty('websiteCode');
        expect(sent('start-datapack-import')).not.toHaveProperty('storeCode');
    });

    it('runs on its steps while the job runs, with Run in Background as the way out, which hands it over', async () => {
        answer({ statusAfter: record() });
        const { onClose } = await openOnSummary();

        await press(button('Install'));

        expect(await heading('Installing Bodea')).toBeInTheDocument();
        expect(screen.getByTestId('import-run')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
        await press(button('Run in Background'));
        expect(mockPostMessage.mock.calls).toStrictEqual([
            ['backgroundOperation', { id: DATAPACK_OPERATION_ID, title: 'Installing Bodea' }],
        ]);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ends clean on the small result, which closes itself', async () => {
        const { onClose } = await openOnSummary();

        await press(button('Install'));

        expect(await heading('Bodea Installed')).toBeInTheDocument();
        expect(screen.queryByTestId('import-run')).not.toBeInTheDocument();
        await act(async () => {
            jest.advanceTimersByTime(TIMEOUTS.UI.RESULT_GLANCE);
        });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ends a stopped run as "Couldn\'t Install Bodea" on its steps, with Retry, which starts it again', async () => {
        answer({
            statusAfter: record({
                outcome: 'partial',
                perType: { categories: 'success', products: 'error' },
                stoppedAt: 'products',
                reason: 'Commerce did not respond.',
                retryable: true,
            }),
        });
        await openOnSummary();
        await press(button('Install'));

        expect(await heading("Couldn't Install Bodea")).toBeInTheDocument();
        expect(screen.getByTestId('import-run')).toBeInTheDocument();
        expect(screen.getByText('Commerce did not respond.')).toBeInTheDocument();

        await press(button('Retry'));

        expect(sends('start-datapack-import')).toBe(2);
    });

    it('shows a refused start verbatim', async () => {
        answer({
            start: { success: false, error: 'Invalid input. Must provide one of: (datapack_name)' },
        });
        await openOnSummary();

        await press(button('Install'));

        expect(await heading("Couldn't Install Bodea")).toBeInTheDocument();
        expect(screen.getByText(/Must provide one of/)).toBeInTheDocument();
    });
});

describe('Dry Run', () => {
    it('answers Passed in its own window, Back and Install, and Install starts the same install', async () => {
        await openOnSummary();

        await press(button('Dry Run'));

        expect(await heading('Dry Run Passed')).toBeInTheDocument();
        expect(
            screen.getByText('Bodea can be installed here. Nothing was written.')
        ).toBeInTheDocument();
        expect(sent('validate-datapack-import')).toEqual({
            datapackName: 'bodea',
            version: 'main',
            commerceInstance: 'inst',
            dataTypes: ['categories', 'products'],
            ...PROJECT_SCOPE,
        });
        await press(button('Install'));
        expect(sends('start-datapack-import')).toBe(1);
    });

    const PROBLEM = {
        validate: {
            success: true,
            data: {
                valid: false,
                reason: "Bodea's products name an attribute set Commerce doesn't have.",
            },
        },
    };

    // Step 03, S5: the install's ending buttons, Close, Back and Fix with AI (accent, last).
    it('answers Found a Problem with the reason, Close, Back and Fix with AI last', async () => {
        answer(PROBLEM);
        await openOnSummary();

        await press(button('Dry Run'));

        expect(await heading('Dry Run Found a Problem')).toBeInTheDocument();
        expect(screen.getByText(/attribute set Commerce doesn't have/)).toBeInTheDocument();
        const names = screen.getAllByRole('button').map((b) => b.textContent);
        expect(names.slice(-3)).toEqual(['Close', 'Back', 'Fix with AI']);
        // The Modal's footer button: accent is its primary class, the hint its hover text.
        expect(button('Fix with AI')).toHaveClass('modal-button-primary');
        expect(button('Fix with AI')).toHaveAttribute(
            'title',
            'Opens your AI assistant on this problem'
        );
        expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
        await press(button('Back'));
        expect(await heading('Install Bodea')).toBeInTheDocument();
    });

    it('asks the extension for the dry run’s Fix with AI, sending nothing of the window', async () => {
        answer(PROBLEM);
        await openOnSummary();
        await press(button('Dry Run'));
        await heading('Dry Run Found a Problem');

        await press(button('Fix with AI'));

        expect(sent('fix-datapack-import-with-ai')).toEqual({ from: 'dry-run' });
    });

    it('answers Failed with Back and Retry, and Retry runs it again', async () => {
        answer({ validate: { success: false, error: 'Commerce could not be reached.' } });
        await openOnSummary();
        await press(button('Dry Run'));

        expect(await heading('Dry Run Failed')).toBeInTheDocument();
        await press(button('Retry'));

        expect(sends('validate-datapack-import')).toBe(2);
    });

    // The rule `importResult.ts` keeps: request state persists after settling, so a fixed
    // precedence would replay the refused start over the Dry Run just pressed.
    it('shows the Dry Run just pressed, never an earlier refused start', async () => {
        answer({ start: { success: false, error: 'Refused.' } });
        await openOnSummary();
        await press(button('Install'));
        expect(await heading("Couldn't Install Bodea")).toBeInTheDocument();
        await press(button('Back'));

        await press(button('Dry Run'));

        expect(await heading('Dry Run Passed')).toBeInTheDocument();
    });
});

describe('a window opened on a running job', () => {
    it('starts at its run, titled by what the job is for, and never checks', async () => {
        answer({ statusBefore: record({ purpose: 'restore', datapackName: 'my-luma' }) });
        renderWindow({
            id: { name: 'my-luma', version: 'v2' },
            displayName: 'My Luma',
            startsAt: 'run',
        });
        await settle();

        expect(await heading('Restoring My Luma')).toBeInTheDocument();
        expect(screen.getByTestId('import-run')).toBeInTheDocument();
        expect(sends('preview-datapack-changes')).toBe(0);
        expect(button('Run in Background')).toBeInTheDocument();
    });

    it('ends on the result titled for its purpose', async () => {
        answer({
            statusBefore: record({
                purpose: 'undo',
                outcome: 'success',
                perType: { categories: 'success', products: 'success' },
            }),
        });
        renderWindow({ displayName: 'My Luma', startsAt: 'run' });
        await settle();
        await settle();

        expect(await heading('Last Save Undone')).toBeInTheDocument();
    });

    it('an install window that finds a job running picks it up at its run', async () => {
        answer({ statusBefore: record() }, ['preview-datapack-changes']);
        renderWindow();
        await settle();

        expect(await heading('Installing Bodea')).toBeInTheDocument();
        expect(button('Run in Background')).toBeInTheDocument();
    });
});

it('just closes when no job is running', async () => {
    const { onClose } = await openOnSummary();

    await press(button('Cancel'));

    expect(mockPostMessage.mock.calls).toStrictEqual([]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockRequest).not.toHaveBeenCalledWith('start-datapack-import', expect.anything());
});

/**
 * Which window opens (S4, S6): the new one for a first install, a switch over another datapack and
 * a job already running; today's window for what S7 and S8 move (another version of the held
 * datapack, and Uninstall).
 */
describe('windowRoute', () => {
    const id = { name: 'bodea', version: 'main' };
    const luma = { name: 'luma', version: 'v1', store: 'library' as const };
    it.each([
        ['a first install, the project holding no datapack', { id }, 'install'],
        ['a run opened by Undo or Restore', { id, holding: { pack: luma, recorded: true }, opensOn: 'run' as const }, 'watch'],
        ['Uninstall', { id, holding: { pack: luma, recorded: true }, opensOn: 'remove' as const }, 'modal'],
        ['a switch over another datapack Demo Builder installed', { id, holding: { pack: luma, recorded: true } }, 'switch'],
        ['another datapack with nothing to uninstall it by: an install', { id, holding: { pack: luma, recorded: false } }, 'install'],
        ['another version of the datapack the project holds', { id, holding: { pack: { ...luma, name: 'bodea' }, recorded: true } }, 'modal'],
    ])('%s', (_name, opened, route) => {
        expect(windowRoute(opened)).toBe(route);
    });
});
