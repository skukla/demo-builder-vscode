/**
 * A datapack job's check (step 03, S4, S6 and S7): the project's target, and what the job's question
 * stands over. An install and a switch read what installing changes (`preview-datapack-changes`); an
 * uninstall reads what the install record lists (`get-datapack-removal-scope`). A switch and an
 * uninstall also read the SC's changes to the datapack they uninstall (`useSwitchChanges`): the
 * held one for a switch, the one opened for an uninstall. An update reads what the newer version
 * changed (`update-datapack` without `confirm`; step-07 U1). Then the request body every start sends.
 *
 * Split out of `useDatapackJob`, which holds the phases and the starts.
 *
 * @module features/data-installer/ui/hooks/useJobReads
 */

import { useCallback, useEffect, useMemo } from 'react';
import type { DatapackRemovalScope } from '../../removalChanges';
import type { ChangePreview } from '../../services/demoBuilderEngine/storeChanges';
import { libraryField } from '../components/importModalJob';
import { isUpToDate } from '../components/importResult';
import type { JobKind } from '../components/job/datapackJob';
import { countedRows, installRows, type TypeRow } from '../components/job/installRows';
import { updateRows } from '../components/job/updateRows';
import { useDataInstallerRequest } from './useDataInstallerRequest';
import { type SwitchedFrom, useSwitchChanges } from './useSwitchChanges';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';
import type {
    DatapackRecordsRequest,
    RestoreDatapackRequest,
    UpdateDatapackRequest,
    UpdateDatapackResult,
    UpdateTypeChange,
} from '@/types/webviewRequests';

/** What `get-datapack-import-target` says of the open project. */
export interface JobTarget extends SwitchedFrom {
    instance?: string;
    scope?: { websiteCode: string; storeCode: string };
}

/** What the reads are about. */
export interface JobReadsArgs {
    id: DatapackId;
    displayName: string;
    source?: DatapackStoreName;
    kind: JobKind;
    /** The whole pack's data types: an install sends every one (decisions Phase 3, J2-1). */
    types: string[];
    /** The SC's own datapacks' names, which a new one may not take. */
    ownNames: readonly string[];
}

const COMPARE = { timeout: TIMEOUTS.DATAPACK_IMPORT_COMPARE };

/** Restore, confirmed from its question: its point rides on the start (`StartExtra`). */
function restoreConfirmed(datapackName: string): RestoreDatapackRequest {
    return { datapackName, confirm: true };
}

/** Update, confirmed from its summary: the types ticked ride on the start (`StartExtra`). */
function updateConfirmed(datapackName: string): UpdateDatapackRequest {
    return { datapackName, confirm: true };
}
const NO_ROWS: TypeRow[] = [];
const NO_CHANGES: UpdateTypeChange[] = [];

/** What an update's check found: the changes by type, that nothing is left, or why it could not tell. */
export interface UpdateCheck {
    changes: UpdateTypeChange[];
    upToDate: boolean;
    failure: string | null;
    /** The version the check answered for: Update sends it, refused if the library moved on. */
    version?: string;
}

/** An update's check: the changes the newer version brings, by type. */
function useUpdateCheck(kind: JobKind, datapackName: string) {
    const check = useDataInstallerRequest<UpdateDatapackResult>('update-datapack', COMPARE);
    const loadCheck = check.load;
    useEffect(() => {
        if (kind !== 'update') return;
        // Every record's name: Review Records lists them (an agent's check names the first few).
        const body: UpdateDatapackRequest = { datapackName, records: true };
        loadCheck(body);
    }, [loadCheck, kind, datapackName]);
    const value = check.value;
    useSettleMove(datapackName, value);
    const answer = useMemo(
        (): UpdateCheck => ({
            changes: value && 'changes' in value ? value.changes : NO_CHANGES,
            upToDate: value !== null && 'upToDate' in value,
            failure: check.failure?.message ?? null,
            ...(value && 'target' in value ? { version: value.target.version } : {}),
        }),
        [value, check.failure],
    );
    return { read: check, answer };
}

/**
 * Up to date over a newer version that writes nothing (J9-4): the check wrote nothing, so the window
 * confirms the move onto it, once, with the version checked, and the dot goes.
 */
function useSettleMove(datapackName: string, value: UpdateDatapackResult | null): void {
    const settle = useDataInstallerRequest<UpdateDatapackResult>('update-datapack', COMPARE);
    const loadSettle = settle.load;
    const movesTo = value && 'upToDate' in value ? value.movesTo : undefined;
    useEffect(() => {
        if (!movesTo) return;
        const body: UpdateDatapackRequest = { datapackName, confirm: true, version: movesTo };
        loadSettle(body);
    }, [loadSettle, datapackName, movesTo]);
}

/** The datapack an uninstall takes out, as the changes read names it: the one the window opened on. */
function useUninstalled(args: JobReadsArgs): SwitchedFrom | null {
    const { id, displayName, source, kind } = args;
    return useMemo(
        () =>
            kind === 'uninstall'
                ? { datapack: { ...id, store: source ?? 'installer' }, heldName: displayName }
                : null,
        [kind, id, source, displayName],
    );
}

/** The read the type table stands on, by kind. */
function tableReadOf<A, B, C>(kind: JobKind, reads: { preview: A; scope: B; update: C }): A | B | C {
    if (kind === 'uninstall') return reads.scope;
    return kind === 'update' ? reads.update : reads.preview;
}

/** The type table's read: the preview for what installs, the record for an uninstall, the update's check. */
function useTableRead(args: JobReadsArgs, pack: object) {
    const { id, kind } = args;
    const preview = useDataInstallerRequest<ChangePreview>('preview-datapack-changes', COMPARE);
    const scope = useDataInstallerRequest<DatapackRemovalScope>('get-datapack-removal-scope');
    const update = useUpdateCheck(kind, id.name);
    const loadPreview = preview.load;
    const loadScope = scope.load;
    useEffect(() => {
        if (kind === 'uninstall') loadScope({ datapackName: id.name, version: id.version, removal: true });
        else if (kind === 'install' || kind === 'switch') loadPreview(pack);
    }, [loadPreview, loadScope, kind, id, pack]);
    const read = tableReadOf(kind, { preview, scope, update: update.read });
    const kinds = preview.value?.kinds;
    const recorded = scope.value?.kinds;
    const changes = update.answer.changes;
    const rows = useMemo(() => {
        if (kind === 'uninstall') return recorded ? countedRows(recorded) : NO_ROWS;
        if (kind === 'update') return updateRows(changes);
        return kinds ? installRows(kinds) : NO_ROWS;
    }, [kind, kinds, recorded, changes]);
    // An install of what the store already matches has nothing to do (owner walk Q8).
    const matches = kind === 'install' && preview.value !== null && isUpToDate(preview.value);
    return { settled: read.settled, failed: read.failure !== null, rows, update: update.answer, matches };
}

/** The check's reads: the target, the type table's read, and the SC's changes. */
export function useJobReads(args: JobReadsArgs) {
    const { id, source, kind } = args;
    const target = useDataInstallerRequest<JobTarget>('get-datapack-import-target');
    // The datapack as the reads name it (`get-datapack-records` and the preview take the same fields).
    const pack = useMemo(
        (): DatapackRecordsRequest => ({ datapackName: id.name, version: id.version, ...libraryField(source) }),
        [id, source],
    );
    const loadTarget = target.load;
    useEffect(() => loadTarget({}), [loadTarget]);
    const table = useTableRead(args, pack);
    const uninstalled = useUninstalled(args);
    const asks = kind === 'switch' || kind === 'uninstall';
    const changes = useSwitchChanges(asks, uninstalled ?? target.value, args.ownNames);
    return { target, table, pack, changes };
}

/**
 * The request body Dry Run and every start send: the whole pack, to the project's target. An
 * uninstall sends no data types and no website: what goes, and from where, is the record's; and
 * `confirm`, which the handler refuses without, added here and only from a press. A restore sends
 * only the datapack's name and `confirm`: its target is the project's, read by the handler.
 */
export function useRequestBody(args: JobReadsArgs, target: JobTarget | null, pack: object) {
    const instance = target?.instance ?? '';
    const scope = target?.scope;
    const { types, kind, id } = args;
    return useCallback(() => {
        if (kind === 'restore') return restoreConfirmed(id.name);
        if (kind === 'update') return updateConfirmed(id.name);
        if (kind === 'uninstall') return { ...pack, commerceInstance: instance, confirm: true };
        return {
            ...pack,
            commerceInstance: instance,
            dataTypes: types,
            ...(scope ? { websiteCode: scope.websiteCode, storeCode: scope.storeCode } : {}),
        };
    }, [pack, instance, types, scope, kind, id.name]);
}
