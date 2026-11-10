/**
 * importModalView — what the import modal shows for the state it is in.
 *
 * Pure functions, so each decision is pinned without rendering the modal: which
 * view wins, which job is watched, what the busy line says, and the footer row.
 * The modal's own suites still drive these through the DOM; this suite is where
 * a branch is separated from its absence.
 *
 * ## watchedActivation: which job the modal watches when two operations run in one session.
 *
 * The bug this pins: `useVSCodeRequest.execute` clears `error` before a request
 * but NOT `data`, and the modal never calls its `reset()`. So a completed import
 * leaves `start.value.activationId` set for the modal's lifetime. The previous
 * rule — `start.value ?? reset.value` — therefore preferred the FINISHED import
 * forever.
 *
 * What that cost: an import followed by a reset watched the wrong activation, so
 * the effect keyed on that id never re-fired, status was never re-read, polling
 * never started, and the reset's terminal record was dropped by the
 * `record.activationId === startedActivation` guard. The modal fell back to the
 * form with "Start import" enabled while a destructive reset ran server-side.
 * Reset-then-import worked, which is what made it a bug rather than a design.
 *
 * Tested as a pure function rather than through the rendered modal: driving two
 * full operations through the UI costs far more than the rule is complex, and
 * this is the whole of the rule.
 */

import {
    buildActions,
    busyMessage,
    closeLabel,
    isRemoving,
    resolveView,
    runColumns,
    targetName,
    TWO_COLUMN_MIN_VIEWPORT,
    isPickingUp,
    viewFrame,
    waitOf,
    watchedActivation,
} from '@/features/data-installer/ui/components/importModalView';
import type { ImportScopes } from '@/features/data-installer/ui/hooks/useImportScopes';
import type { LastAction, ResultContent } from '@/features/data-installer/ui/components/importResult';

describe('watchedActivation', () => {
    /** The regression. Both ids are present; the reset must win. */
    it('watches the RESET after an import already finished', () => {
        expect(watchedActivation('reset', 'act-import', 'act-reset')).toBe('act-reset');
    });

    /** The direction that always worked — it must keep working. */
    it('watches the IMPORT after a reset already finished', () => {
        expect(watchedActivation('start', 'act-import', 'act-reset')).toBe('act-import');
    });

    it('watches the only job there is', () => {
        expect(watchedActivation('start', 'act-import', undefined)).toBe('act-import');
        expect(watchedActivation('reset', undefined, 'act-reset')).toBe('act-reset');
    });

    /**
     * A dry run starts no job, so it should not change which job is being
     * watched — the modal may have been reopened onto a running one.
     */
    it.each<[LastAction | null]>([['dryRun'], [null]])(
        'falls back to whichever job exists when the last action was %s',
        (action) => {
            expect(watchedActivation(action, 'act-import', undefined)).toBe('act-import');
            expect(watchedActivation(action, undefined, 'act-reset')).toBe('act-reset');
        }
    );

    /**
     * A started import that produced NO id watches nothing — it does not fall
     * through to a reset from earlier in the session. Without this the 'start'
     * arm can be deleted entirely and every other case still passes, because
     * the fallback below happens to return the same id whenever both exist.
     */
    it('watches nothing when the started import has no id, even with a reset id to hand', () => {
        expect(watchedActivation('start', undefined, 'act-reset')).toBeUndefined();
    });

    /** The same for the reset arm, so neither is load-bearing by accident. */
    it('watches nothing when the confirmed removal has no id', () => {
        expect(watchedActivation('reset', 'act-import', undefined)).toBeUndefined();
    });

    it('has nothing to watch before any job starts', () => {
        expect(watchedActivation(null, undefined, undefined)).toBeUndefined();
    });
});

/** A result to show, typed to the real interface. */
const RESULT: ResultContent = { variant: 'success', title: 'Dry Run Passed' };

/** Nothing set: the state a fresh modal with an instance is in. */
const IDLE = { busy: false, resetArmed: false, running: false, result: null, noInstance: false };

describe('resolveView', () => {
    it('shows the form when nothing is happening', () => {
        expect(resolveView(IDLE)).toBe('form');
    });

    it('shows each view when only its own condition holds', () => {
        expect(resolveView({ ...IDLE, busy: true })).toBe('busy');
        expect(resolveView({ ...IDLE, resetArmed: true })).toBe('confirm-reset');
        expect(resolveView({ ...IDLE, running: true })).toBe('watching');
        expect(resolveView({ ...IDLE, result: RESULT })).toBe('result');
        expect(resolveView({ ...IDLE, noInstance: true })).toBe('no-instance');
    });

    /** The precedence IS the state machine: each condition outranks the next. */
    it('lets a request in flight outrank everything', () => {
        const all = { busy: true, resetArmed: true, running: true, result: RESULT, noInstance: true };
        expect(resolveView(all)).toBe('busy');
    });

    it('lets an armed removal outrank a running job, a result and a missing instance', () => {
        const state = { ...IDLE, resetArmed: true, running: true, result: RESULT, noInstance: true };
        expect(resolveView(state)).toBe('confirm-reset');
    });

    it('lets a running job outrank a result and a missing instance', () => {
        expect(resolveView({ ...IDLE, running: true, result: RESULT, noInstance: true })).toBe(
            'watching',
        );
    });

    /** A missing instance only matters when the user is about to choose something. */
    it('lets a result outrank a missing instance', () => {
        expect(resolveView({ ...IDLE, result: RESULT, noInstance: true })).toBe('result');
    });
});

// Review, 2026-11-10: each wait is the progress window's three rows, never a bare label.
describe('busyMessage', () => {
    it('waits on an uninstall in the stage the uninstall itself reports', () => {
        expect(busyMessage(true)).toStrictEqual({
            label: 'Uninstalling the datapack',
            expectation: 'Usually a few minutes',
            detail: 'From Commerce',
        });
    });

    /** A dry run is the only busy state left: an import starting shows its steps instead. */
    it('waits on a dry run, with no second line', () => {
        expect(busyMessage(false)).toStrictEqual({
            label: 'Running the dry run',
            expectation: 'Usually a few seconds',
        });
    });
});

describe('an import starting', () => {
    it('is its own view, ahead of the plain wait', () => {
        expect(resolveView({ ...IDLE, busy: true, starting: true })).toBe('starting');
        expect(resolveView({ ...IDLE, busy: true })).toBe('busy');
    });

    it('takes the running import’s frame, footer and way out', () => {
        const frame = viewFrame({ view: 'starting', displayName: 'Frescopa', removing: false, store: '', typeCount: 8, columns: 2, result: null });
        expect(frame).toMatchObject({ size: 'L', wide: false, title: 'Installing Frescopa' });
        expect(rows(actionArgs({ view: 'starting' }))).toStrictEqual([]);
        expect(closeLabel('starting')).toBe('Run in Background');
        expect(waitOf('starting', false, { label: '' })).toBe(false);
    });
});

type ActionArgs = Parameters<typeof buildActions>[0];

/** Every callback a distinct mock, so a test can tell which one a button calls. */
function actionArgs(over: Partial<ActionArgs> = {}): ActionArgs {
    return {
        view: 'form',
        canStart: true,
        checking: false,
        starting: false,
        resetting: false,
        validate: jest.fn(),
        disarmReset: jest.fn(),
        confirmReset: jest.fn(),
        startImport: jest.fn(),
        goBack: jest.fn(),
        ...over,
    };
}

/** The footer as label/variant/disabled rows, which is what the user sees. */
function rows(args: ActionArgs): { label: string; variant: string; isDisabled?: boolean }[] {
    return buildActions(args).map(({ label, variant, isDisabled }) =>
        isDisabled === undefined ? { label, variant } : { label, variant, isDisabled },
    );
}

describe('buildActions', () => {
    // The way out is the dialog's own Run in Background: a Close beside it did the same thing
    // (owner, 2026-11-07). NOT "Cancel": there is no endpoint to cancel with.
    it('offers nothing beside Run in Background while a job runs', () => {
        expect(rows(actionArgs({ view: 'watching' }))).toStrictEqual([]);
        expect(closeLabel('watching')).toBe('Run in Background');
    });

    // Cancel stands in for Close, which the confirm's frame hides: one way back, not two.
    it('offers Cancel and a red Remove when a removal is armed', () => {
        const args = actionArgs({ view: 'confirm-reset' });
        const actions = buildActions(args);
        expect(rows(args)).toStrictEqual([
            { label: 'Cancel', variant: 'secondary' },
            { label: 'Uninstall', variant: 'negative' },
        ]);
        expect(actions[0].onPress).toBe(args.disarmReset);
        expect(actions[1].onPress).toBe(args.confirmReset);
    });

    // Nothing left but the way out, which the frame's Close already is: three dead buttons before.
    it('offers nothing beside Close when the project has no Commerce instance', () => {
        expect(rows(actionArgs({ view: 'no-instance' }))).toStrictEqual([]);
    });

    it('offers only Back on a result with nothing left to do', () => {
        const args = actionArgs({ view: 'result' });
        expect(rows(args)).toStrictEqual([{ label: 'Back', variant: 'secondary' }]);
        expect(buildActions(args)[0].onPress).toBe(args.goBack);
    });

    // The main action last (dialog design rules), owner 2026-11-07.
    it.each([
        ['retry', 'Retry'],
        ['fix', 'Fix with AI'],
    ] as const)('puts a result’s %s action last, accent, wired', (resultAction, label) => {
        const args = actionArgs({ view: 'result', resultAction, retry: jest.fn(), fixWithAi: jest.fn() });
        const actions = buildActions(args);
        expect(rows(args)).toStrictEqual([
            { label: 'Back', variant: 'secondary' },
            { label, variant: 'accent' },
        ]);
        expect(actions[1].onPress).toBe(resultAction === 'retry' ? args.retry : args.fixWithAi);
    });

    // The main action last; Dry Run outlined, as Close is (walk F102). Remove Data is not here: it
    // opens this window straight on its confirm (`opensOn: 'remove'`, walk F118).
    it('shows Dry Run outlined, then Install, each wired', () => {
        const args = actionArgs();
        const actions = buildActions(args);
        expect(rows(args)).toStrictEqual([
            { label: 'Dry Run', variant: 'secondary', isDisabled: false },
            { label: 'Install', variant: 'accent', isDisabled: false },
        ]);
        expect(actions[0].onPress).toBe(args.validate);
        expect(actions[1].onPress).toBe(args.startImport);
    });

    it('disables both form buttons when the import cannot start', () => {
        const disabled = buildActions(actionArgs({ canStart: false })).map((a) => a.isDisabled);
        expect(disabled).toStrictEqual([true, true]);
    });

    // A finished import ends on Close alone, the frame's own (walk F117): nothing to go back to.
    it('offers nothing beside Close once an import ran to its end', () => {
        expect(rows(actionArgs({ view: 'result', ranToEnd: true }))).toStrictEqual([]);
    });

    // Uninstall's window has no form behind it: a Back would only close, as Close does (review, 2026-11-10).
    it('offers no Back on a result whose Back would only close the window', () => {
        expect(rows(actionArgs({ view: 'result', backCloses: true }))).toStrictEqual([]);
        expect(rows(actionArgs({ view: 'result', backCloses: false }))).toStrictEqual([{ label: 'Back', variant: 'secondary' }]);
    });

    it('keeps a retry after an import ran to its end, without Back', () => {
        const args = actionArgs({ view: 'result', ranToEnd: true, resultAction: 'retry', retry: jest.fn() });
        expect(rows(args)).toStrictEqual([{ label: 'Retry', variant: 'accent' }]);
    });

    // With changes to keep, the button that loses them stands at the footer's start (walk F111).
    it('puts Uninstall Without Saving at the start, red, and the rest at the end', () => {
        const args = actionArgs({ view: 'confirm-reset', removeWithoutSaving: jest.fn() });
        const actions = buildActions(args);
        expect(actions.map((a) => [a.label, a.variant, a.start === true])).toStrictEqual([
            ['Cancel', 'secondary', false],
            ['Uninstall Without Saving', 'negative', true],
            ['Save and Uninstall', 'accent', false],
        ]);
        expect(actions[1].onPress).toBe(args.removeWithoutSaving);
        expect(actions[2].onPress).toBe(args.confirmReset);
    });

    it('CONTROL: with nothing to keep, no button stands at the start', () => {
        expect(buildActions(actionArgs({ view: 'confirm-reset' })).some((a) => a.start)).toBe(false);
    });

    /**
     * Busy shares the form's row. The body shows the spinner, so every button keeps its label and
     * stops taking presses: one spinner per wait, no "-ing" label (owner, 2026-10-31).
     */
    it('keeps every label while a check or a start runs', () => {
        for (const busy of [{ checking: true }, { starting: true }]) {
            const actions = buildActions(actionArgs({ view: 'busy', canStart: false, ...busy }));
            expect(actions.map((a) => a.label)).toStrictEqual(['Dry Run', 'Install']);
            expect(actions.every((a) => a.isDisabled === true)).toBe(true);
        }
    });
});

/** A scope with one website and its store view chosen, as the import form leaves it. */
const CHOSEN: ImportScopes = {
    websites: [{ code: 'justrite_test_website', name: 'Justrite Test', storeViews: [{ code: 'justrite_test_store_us', name: 'Justrite Test Store US' }] }],
    loading: false,
    websiteCode: 'justrite_test_website',
    storeCode: 'justrite_test_store_us',
    chooseWebsite: jest.fn(),
    chooseStore: jest.fn(),
    targetFields: () => ({}),
    locked: false,
    lockTo: jest.fn(),
};

describe('targetName', () => {
    it('names the store view and its website as the SC picked them', () => {
        expect(targetName(CHOSEN, 'inst-1')).toBe('Justrite Test Store US (Justrite Test)');
    });

    it('falls back to the instance when nothing was discovered', () => {
        expect(targetName({ ...CHOSEN, websites: [] }, 'inst-1')).toBe('inst-1');
    });
});

/**
 * Each view's title, status and width, by the dialog design rules (owner, 2026-10-31): the form
 * as wide as its types need, everything after it small; the confirm asks with the store in its
 * title; a result's title is its outcome.
 */
describe('isPickingUp', () => {
    it.each([
        ['no job accepted', undefined, null, undefined, false, false],
        ['accepted, not asked about yet', 'a', null, undefined, false, true],
        ['accepted, the read is out', 'a', null, 'a', true, true],
        ['the read answered with no record', 'a', null, 'a', false, false],
        ['the read answered with this job', 'a', { activationId: 'a' }, 'a', false, false],
        ['an older job on screen, the read is out', 'b', { activationId: 'a' }, 'b', true, true],
    ])('%s', (_label, activation, record, asked, reading, expected) => {
        expect(isPickingUp(activation, record, asked, reading)).toBe(expected);
    });
});

describe('viewFrame', () => {
    const base = { displayName: 'Frescopa', removing: false, store: 'Justrite Test Store US (Justrite Test)', typeCount: 1, columns: 1 as const, result: null };

    // Walk F106: an import's confirm asks about the SC's changes, not about removing; F104: wide
    // enough for its three buttons.
    it('asks an import\'s confirm whether to save the SC\'s changes, at medium width', () => {
        const confirm = viewFrame({ ...base, view: 'confirm-reset', replacing: 'My Luma, Nov 1, 12:00 PM' });
        expect(confirm).toMatchObject({ title: 'Save Your Changes First?', size: 'M' });
        // CONTROL: a removal's confirm names the store, at the same width (F104, F111).
        expect(viewFrame({ ...base, view: 'confirm-reset' })).toMatchObject({ title: 'Uninstall Frescopa from Justrite Test Store US (Justrite Test)?', size: 'M' });
    });

    // Walk F108: while it checks, the title names the work, not a question nothing has asked yet.
    it('titles the check by the work, with no warning icon, at the confirm\'s width', () => {
        expect(viewFrame({ ...base, view: 'reading-changes', replacing: 'Luma, eds-compatible' })).toStrictEqual({
            title: 'Install Frescopa',
            size: 'M',
            wide: false,
            hideClose: false,
        });
        expect(viewFrame({ ...base, view: 'reading-changes' })).toStrictEqual({
            title: 'Uninstall Frescopa',
            size: 'M',
            wide: false,
            hideClose: false,
        });
    });

    // Walk F127: an import's check and question take the run's box, so the window keeps one width
    // to the end and the buttons stay on one line; an uninstall's confirm stays medium.
    it("gives an import's check and question the run's width", () => {
        const eleven = { ...base, typeCount: 11, columns: 2 as const, replacing: 'My Luma, Nov 9, 3:39 PM' };
        const run = viewFrame({ ...eleven, view: 'watching' });

        expect(run).toMatchObject({ size: 'L', wide: false });
        expect(viewFrame({ ...eleven, view: 'reading-changes' })).toMatchObject({ size: run.size, wide: run.wide });
        expect(viewFrame({ ...eleven, view: 'confirm-reset' })).toMatchObject({ size: run.size, wide: run.wide });
        // CONTROL: an uninstall's confirm of the same pack stays medium.
        expect(viewFrame({ ...base, typeCount: 11, view: 'confirm-reset' })).toMatchObject({ size: 'M' });
    });

    it('labels an import\'s confirm buttons Import, losing the changes as an outlined button', () => {
        const actions = buildActions(actionArgs({ view: 'confirm-reset', confirmsImport: true, removeWithoutSaving: jest.fn(), removeLabel: 'Save and Uninstall' }));
        expect(actions.map((a) => [a.label, a.variant])).toEqual([
            ['Cancel', 'secondary'],
            ['Install Without Saving', 'secondary'],
            ['Save and Install', 'accent'],
        ]);
        const unread = buildActions(actionArgs({ view: 'confirm-reset', confirmsImport: true, removeLabel: 'Uninstall Anyway' }));
        expect(unread.map((a) => a.label)).toEqual(['Cancel', 'Install Anyway']);
    });

    it.each([
        [1, 'M', false],
        [6, 'M', false],
        [7, 'L', false],
        [12, 'L', false],
        [13, 'L', true],
    ])('gives a form of %i types the %s width (extra-wide: %s)', (typeCount, size, wide) => {
        expect(viewFrame({ ...base, view: 'form', typeCount })).toMatchObject({ size, wide, title: 'Install Frescopa', hideClose: false });
    });

    it('gives the removal that kept a root the medium width, so its Admin path reads as one line', () => {
        const keptRoot = { store: 'Justrite Test Store', category: 'ZZ Root DB12', restore: 'Justrite Catalog' };
        const result = { variant: 'warning' as const, title: 'One step left to remove Frescopa', keptRoot };

        expect(viewFrame({ ...base, view: 'result', result })).toMatchObject({ size: 'M', status: 'warning' });
    });

    it('titles a project with no instance by its outcome, amber, at the small width', () => {
        expect(viewFrame({ ...base, view: 'no-instance' })).toMatchObject({
            title: 'No Commerce Instance',
            status: 'warning',
            size: 'S',
            wide: false,
            hideClose: false,
        });
    });

    // An import runs on its steps in the box the form had; one that ended with a problem stays
    // there (owner, 2026-11-07, 2026-11-10).
    it('keeps the form’s width while an import runs, and for an ending with a problem on its steps', () => {
        const run = { variant: 'warning' as const, title: 'Frescopa Installed', run: {} as ResultContent['run'] };

        expect(viewFrame({ ...base, view: 'watching', typeCount: 8, columns: 2 })).toMatchObject({ size: 'L', wide: false, title: 'Installing Frescopa' });
        expect(viewFrame({ ...base, view: 'result', typeCount: 8, columns: 2, result: run })).toMatchObject({ size: 'L', status: 'warning', title: 'Frescopa Installed' });
    });

    // Walk F134: a clean finish carries no `run`, so it hands off to the small result.
    it('hands a clean import finish to the small result, with its green icon', () => {
        const clean: ResultContent = { variant: 'success', title: 'Frescopa Installed', finished: true, message: 'Your changes are saved in Version History.' };

        expect(viewFrame({ ...base, view: 'result', typeCount: 8, columns: 2, result: clean })).toEqual({
            title: 'Frescopa Installed',
            status: 'success',
            size: 'S',
            wide: false,
            hideClose: false,
        });
    });

    // Walk F135: one column at medium for six or fewer data types, or in an editor too narrow for two.
    it('runs one column of data types at medium, and two at the form’s width', () => {
        expect(viewFrame({ ...base, view: 'watching', typeCount: 6, columns: 1 })).toMatchObject({ size: 'M', wide: false });
        expect(viewFrame({ ...base, view: 'watching', typeCount: 11, columns: 1 })).toMatchObject({ size: 'M', wide: false });
        expect(viewFrame({ ...base, view: 'watching', typeCount: 11, columns: 2 })).toMatchObject({ size: 'L', wide: false });
        // The check before a replace takes the run's width whichever it is (F127).
        expect(viewFrame({ ...base, view: 'reading-changes', typeCount: 11, columns: 1, replacing: 'My Luma' })).toMatchObject({ size: 'M' });
    });

    it('CONTROL: a removal still waits small, on its spinner', () => {
        expect(viewFrame({ ...base, view: 'watching', removing: true, typeCount: 8 })).toMatchObject({ size: 'S', title: 'Uninstall Frescopa' });
    });

    it('CONTROL: any other result stays small', () => {
        const result = { variant: 'success' as const, title: 'Frescopa Uninstalled' };

        expect(viewFrame({ ...base, view: 'result', result })).toMatchObject({ size: 'S' });
    });

    it('asks the removal as the title, naming the store, amber, with Close hidden for Cancel', () => {
        expect(viewFrame({ ...base, view: 'confirm-reset' })).toEqual({
            title: 'Uninstall Frescopa from Justrite Test Store US (Justrite Test)?',
            status: 'warning',
            size: 'M',
            wide: false,
            hideClose: true,
        });
    });

    it('titles a running removal as a removal, small', () => {
        expect(viewFrame({ ...base, view: 'watching', removing: true })).toMatchObject({ title: 'Uninstall Frescopa', size: 'S' });
    });

    it.each([
        ['success', 'success'],
        ['warning', 'warning'],
        ['error', 'error'],
        ['info', undefined],
    ] as const)('takes a %s result’s title and gives it the %s icon', (variant, status) => {
        const result: ResultContent = { variant, title: 'Frescopa Uninstalled' };
        expect(viewFrame({ ...base, view: 'result', result })).toEqual({ title: 'Frescopa Uninstalled', status, size: 'S', wide: false, hideClose: false });
    });
});

describe('runColumns (walk F135)', () => {
    it('takes two columns for more than six data types in an editor wide enough', () => {
        expect(runColumns(7, TWO_COLUMN_MIN_VIEWPORT)).toBe(2);
        expect(runColumns(11, 1400)).toBe(2);
    });

    it('takes one column for six or fewer', () => {
        expect(runColumns(6, 1400)).toBe(1);
        expect(runColumns(1, 1400)).toBe(1);
    });

    it('takes one column in an editor too narrow for two', () => {
        expect(runColumns(11, TWO_COLUMN_MIN_VIEWPORT - 1)).toBe(1);
    });
});

describe('the removal confirm (step 05)', () => {
    const FRAME = { displayName: 'Bodea', removing: false, store: 'Justrite Test', typeCount: 2, columns: 1 as const, result: null };

    it('shows the read before the confirm, and a busy removal before either', () => {
        expect(resolveView({ ...IDLE, readingChanges: true })).toBe('reading-changes');
        expect(resolveView({ ...IDLE, readingChanges: true, resetArmed: true })).toBe('reading-changes');
        expect(resolveView({ ...IDLE, busy: true, readingChanges: true })).toBe('busy');
    });

    // The check and the confirm share a width, so nothing jumps when the question comes (F109).
    it('keeps the confirm\'s width while it reads, and a way out', () => {
        const reading = viewFrame({ ...FRAME, view: 'reading-changes' });
        const confirm = viewFrame({ ...FRAME, view: 'confirm-reset' });

        expect(reading.size).toBe(confirm.size);
        expect(reading.hideClose).toBe(false);
        expect(confirm.hideClose).toBe(true);
    });

    // One check, one name (walk F114); its line says since when, as the question after it does (F126).
    it('waits on the changes check in its words', () => {
        expect(waitOf('reading-changes', false, { label: '' })).toStrictEqual({
            label: 'Checking for your changes',
            expectation: 'Usually about a minute',
        });
    });

    it('calls the way out Cancel while it reads', () => {
        expect(closeLabel('reading-changes')).toBe('Cancel');
    });

    it('offers the background only once a save is under way', () => {
        expect(closeLabel('busy', true)).toBe('Run in Background');
        expect(closeLabel('busy')).toBe('Close');
        expect(closeLabel('watching')).toBe('Run in Background');
    });

    it('says the save\'s stage over the removal\'s, and the removal\'s once there is none', () => {
        expect(busyMessage(true, 'Saving to My Datapacks')).toMatchObject({ label: 'Saving to My Datapacks' });
        expect(busyMessage(true, 'A stage no table names')).toStrictEqual({ label: 'A stage no table names' });
        expect(busyMessage(true, undefined)).toMatchObject({ label: 'Uninstalling the datapack' });
    });

    it.each([
        [{ armed: true, lastAction: null, view: 'confirm-reset' as const }, true],
        [{ armed: false, lastAction: 'reset' as const, view: 'busy' as const }, true],
        [{ armed: false, lastAction: 'reset' as const, view: 'form' as const }, false],
        [{ armed: false, lastAction: null, view: 'watching' as const, operation: 'reset' as const }, true],
        [{ armed: false, lastAction: null, view: 'watching' as const, operation: 'import' as const }, false],
        [{ armed: false, lastAction: 'start' as const, view: 'busy' as const }, false],
    ])('isRemoving %j is %s', (state, expected) => {
        expect(isRemoving(state)).toBe(expected);
    });
});
