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
    watchedActivation,
} from '@/features/data-installer/ui/components/importModalView';
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
     * A dry run and provisioning start no job, so neither should change which
     * job is being watched — the modal may have been reopened onto a running one.
     */
    it.each<[LastAction | null]>([['dryRun'], ['provision'], [null]])(
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
        expect(busyMessage(true, false, false)).toBe('Starting import');
    });

    it('says removal when a removal is starting', () => {
        expect(busyMessage(false, true, false)).toBe('Starting removal');
    });

    it('names the credential setup when that is what runs', () => {
        expect(busyMessage(false, false, true)).toBe('Setting up credentials');
    });

    /** A dry run is the only busy state with none of the three flags set. */
    it('says it is checking when nothing else is running', () => {
        expect(busyMessage(false, false, false)).toBe('Checking with the service');
    });

    it('prefers the import, then the removal, when several flags are set', () => {
        expect(busyMessage(true, true, true)).toBe('Starting import');
        expect(busyMessage(false, true, true)).toBe('Starting removal');
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
        provisioning: false,
        offerProvisioning: false,
        stopWatching: jest.fn(),
        validate: jest.fn(),
        armReset: jest.fn(),
        disarmReset: jest.fn(),
        confirmReset: jest.fn(),
        startImport: jest.fn(),
        provisionCredentials: jest.fn(),
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

    it('asks to keep or remove the data when a removal is armed', () => {
        const args = actionArgs({ view: 'confirm-reset' });
        const actions = buildActions(args);
        expect(rows(args)).toStrictEqual([
            { label: 'Keep the data', variant: 'secondary' },
            { label: 'Remove the data', variant: 'negative' },
        ]);
        expect(actions[0].onPress).toBe(args.disarmReset);
        expect(actions[1].onPress).toBe(args.confirmReset);
    });

    it('offers only Back on a result that has no provisioning offer', () => {
        const args = actionArgs({ view: 'result' });
        expect(rows(args)).toStrictEqual([{ label: 'Back', variant: 'secondary' }]);
        expect(buildActions(args)[0].onPress).toBe(args.goBack);
    });

    it('adds the credential setup beside Back when the result offers it', () => {
        const args = actionArgs({ view: 'result', offerProvisioning: true });
        const actions = buildActions(args);
        expect(rows(args)).toStrictEqual([
            { label: 'Back', variant: 'secondary' },
            { label: 'Set up credentials automatically', variant: 'accent' },
        ]);
        expect(actions[1].onPress).toBe(args.provisionCredentials);
    });

    it('shows Dry run, Remove data and Start import on the form, each wired', () => {
        const args = actionArgs();
        const actions = buildActions(args);
        expect(rows(args)).toStrictEqual([
            { label: 'Dry run', variant: 'secondary', isDisabled: false },
            { label: 'Remove data', variant: 'secondary', isDisabled: false },
            { label: 'Start import', variant: 'accent', isDisabled: false },
        ]);
        expect(actions[0].onPress).toBe(args.validate);
        expect(actions[1].onPress).toBe(args.armReset);
        expect(actions[2].onPress).toBe(args.startImport);
    });

    it('disables all three form buttons when the import cannot start', () => {
        const disabled = buildActions(actionArgs({ canStart: false })).map((a) => a.isDisabled);
        expect(disabled).toStrictEqual([true, true, true]);
    });

    /** Busy shares the form's row and swaps the active label. */
    it('reads Checking on the dry-run button while the check runs', () => {
        const labels = buildActions(actionArgs({ view: 'busy', checking: true })).map((a) => a.label);
        expect(labels).toStrictEqual(['Checking', 'Remove data', 'Start import']);
    });

    it('reads Starting on the start button while an import starts', () => {
        expect(buildActions(actionArgs({ view: 'busy', starting: true }))[2].label).toBe('Starting');
    });

    /** Credential setup runs FIRST and takes ~50s, so it outranks Starting. */
    it('reads Setting up on the start button while credentials are set up, even when starting', () => {
        const busy = actionArgs({ view: 'busy', provisioning: true, starting: true });
        expect(buildActions(busy)[2].label).toBe('Setting up');
        expect(buildActions(actionArgs({ provisioning: true }))[2].label).toBe('Setting up');
    });
});
