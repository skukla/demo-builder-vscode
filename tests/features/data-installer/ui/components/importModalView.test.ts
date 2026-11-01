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
    resolveView,
    targetName,
    viewFrame,
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
const RESULT: ResultContent = { variant: 'success', title: 'Dry run passed' };

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

describe('busyMessage', () => {
    it('names the import when an import is starting', () => {
        expect(busyMessage(true, false)).toBe('Starting import');
    });

    it('says removal when a removal is starting', () => {
        expect(busyMessage(false, true)).toBe('Starting removal');
    });

    /** A dry run is the only busy state with neither flag set. */
    it('says it is checking when nothing else is running', () => {
        expect(busyMessage(false, false)).toBe('Checking with the service');
    });

    it('prefers the import when both flags are set', () => {
        expect(busyMessage(true, true)).toBe('Starting import');
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
        stopWatching: jest.fn(),
        validate: jest.fn(),
        armReset: jest.fn(),
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
    /** NOT "Cancel": there is no endpoint to cancel with. */
    it('offers only Stop watching while a job runs, wired to stopWatching', () => {
        const args = actionArgs({ view: 'watching' });
        const actions = buildActions(args);
        expect(rows(args)).toStrictEqual([{ label: 'Stop watching', variant: 'secondary' }]);
        expect(actions[0].onPress).toBe(args.stopWatching);
    });

    // Cancel stands in for Close, which the confirm's frame hides: one way back, not two.
    it('offers Cancel and a red Remove when a removal is armed', () => {
        const args = actionArgs({ view: 'confirm-reset' });
        const actions = buildActions(args);
        expect(rows(args)).toStrictEqual([
            { label: 'Cancel', variant: 'secondary' },
            { label: 'Remove', variant: 'negative' },
        ]);
        expect(actions[0].onPress).toBe(args.disarmReset);
        expect(actions[1].onPress).toBe(args.confirmReset);
    });

    it('offers only Back on a result', () => {
        const args = actionArgs({ view: 'result' });
        expect(rows(args)).toStrictEqual([{ label: 'Back', variant: 'secondary' }]);
        expect(buildActions(args)[0].onPress).toBe(args.goBack);
    });

    // The main action last; the two beside it quiet (dialog design rules, 2026-10-31).
    it('shows Remove data and Dry run quiet, then Import, each wired', () => {
        const args = actionArgs();
        const actions = buildActions(args);
        expect(rows(args)).toStrictEqual([
            { label: 'Remove data', variant: 'quiet', isDisabled: false },
            { label: 'Dry run', variant: 'quiet', isDisabled: false },
            { label: 'Import', variant: 'accent', isDisabled: false },
        ]);
        expect(actions[0].onPress).toBe(args.armReset);
        expect(actions[1].onPress).toBe(args.validate);
        expect(actions[2].onPress).toBe(args.startImport);
    });

    it('disables all three form buttons when the import cannot start', () => {
        const disabled = buildActions(actionArgs({ canStart: false })).map((a) => a.isDisabled);
        expect(disabled).toStrictEqual([true, true, true]);
    });

    /**
     * Busy shares the form's row. The body shows the spinner, so every button keeps its label and
     * stops taking presses: one spinner per wait, no "-ing" label (owner, 2026-10-31).
     */
    it('keeps every label while a check or a start runs', () => {
        for (const busy of [{ checking: true }, { starting: true }]) {
            const actions = buildActions(actionArgs({ view: 'busy', canStart: false, ...busy }));
            expect(actions.map((a) => a.label)).toStrictEqual(['Remove data', 'Dry run', 'Import']);
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
describe('viewFrame', () => {
    const base = { displayName: 'Frescopa', removing: false, store: 'Justrite Test Store US (Justrite Test)', typeCount: 1, result: null };

    it.each([
        [1, 'M', false],
        [6, 'M', false],
        [7, 'L', false],
        [12, 'L', false],
        [13, 'L', true],
    ])('gives a form of %i types the %s width (extra-wide: %s)', (typeCount, size, wide) => {
        expect(viewFrame({ ...base, view: 'form', typeCount })).toMatchObject({ size, wide, title: 'Import Frescopa', hideClose: false });
    });

    it('asks the removal as the title, naming the store, amber, with Close hidden for Cancel', () => {
        expect(viewFrame({ ...base, view: 'confirm-reset' })).toEqual({
            title: 'Remove from Justrite Test Store US (Justrite Test)?',
            status: 'warning',
            size: 'S',
            wide: false,
            hideClose: true,
        });
    });

    it('titles a running removal as a removal, small', () => {
        expect(viewFrame({ ...base, view: 'watching', removing: true })).toMatchObject({ title: 'Remove Frescopa', size: 'S' });
    });

    it.each([
        ['success', 'success'],
        ['warning', 'warning'],
        ['error', 'error'],
        ['info', undefined],
    ] as const)('takes a %s result’s title and gives it the %s icon', (variant, status) => {
        const result: ResultContent = { variant, title: 'Removed Frescopa' };
        expect(viewFrame({ ...base, view: 'result', result })).toEqual({ title: 'Removed Frescopa', status, size: 'S', wide: false, hideClose: false });
    });
});
