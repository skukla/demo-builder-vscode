/**
 * Add from File — put the pack in a datapack zip into one of the two stores.
 *
 * Opening the modal opens VS Code's file picker (the host's dialog, via
 * `open-datapack-zip`), which reads the file and says what is in it WITHOUT writing
 * anything. Only then does the SC choose where it goes and press Add. Dismissing
 * the picker closes the modal: there is nothing to show without a file.
 *
 * A loaded pack goes into My Datapacks, private to the SC until they share it. The Data
 * Installer is offered as a second destination only under `INSTALLER_WRITES_SHOWN`, the switch
 * that hides Copy to the Data Installer, since our accounts cannot write there yet and loading
 * into it would fail every time. When it is offered, the choice is spelled out because the two
 * differ in who sees the result: the Data Installer's catalog is shared with other teams, so
 * choosing it is the confirmation (the handler also wants the pack's name back, which this
 * sends). When My Datapacks already holds the file's version (Clarity 1.15, step-04 S10) the form
 * asks Replace or Keep Both (step-07 F1, P4-Q10; `AddFileForm`): Replace writes over it, Keep
 * Both adds the file as a new datapack under the name in its box (`saveAs`), the first left as
 * it is. Only into My Datapacks: the Data Installer cannot tell whose pack is whose.
 *
 * In a project's Datapacks a clean load hands the datapack to the install window (step-07 F2,
 * P4-Q7; `onInstall`): Install from File adds, then installs. Cancelling that window leaves the
 * datapack in My Datapacks (owner Q8). In the Datapack Library, with no project, a load only adds.
 *
 * A file can carry the pack's settings layer as a second section (datapack-engine step 09). The
 * form says so, since the layer goes to the library whichever store the SC chooses. The result
 * has one row for what this load created, with one Delete that removes all of it, the datapack and
 * any layer the load created, and never a layer that was there before (owner rule 1).
 *
 * @module features/data-installer/ui/components/AddDatapackFileModal
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { INSTALLER_WRITES_SHOWN } from '../../installerWrites';
import { copyName, longestNameProblem, nameProblem } from '../../saveAsName';
import { dataTypeLabel } from '../dataTypeLabel';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { AddFileForm, type OpenedFile } from './AddFileForm';
import { datapackResultWords } from './datapackResultWords';
import { type ResultContent, resultStatus } from './importResult';
import { RemoveFromLibraryButton } from './RemoveFromLibraryButton';
import { FormDialog } from '@/core/ui/components/ui/FormDialog';
import { ResultDialog, type ResultRow } from '@/core/ui/components/ui/ResultDialog';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** What loading the file's settings layer did. */
interface LoadedLayer {
    datapackName: string;
    version: string;
    outcome: 'created' | 'updated' | 'left' | 'failed';
    reason?: string;
}

/** What `load-datapack-zip` did. */
export interface LoadOutcome {
    datapackName: string;
    version: string;
    /** The name a Keep Both load gave the new datapack. */
    displayName?: string;
    target: DatapackStoreName;
    pack: 'created' | 'updated';
    stored: string[];
    failed: Array<{ dataType: string; reason: string }>;
    settingsLayer?: LoadedLayer;
}

/**
 * A datapack a clean load added to My Datapacks, as the install window opens on it: by id and name
 * only. The window reads the datapack's own types; a Replace may have stored only some of them.
 */
export interface LoadedDatapack {
    id: DatapackId;
    displayName: string;
}

export interface AddDatapackFileModalProps {
    /** Closed, with or without a load. The caller refreshes what it shows. */
    onClose: () => void;
    /** Whether the Data Installer is offered as a destination; off while our accounts cannot write there. */
    offersInstaller?: boolean;
    /** The SC's own datapacks in My Datapacks, by id: Replace or Keep Both is asked only about one of these. */
    mySaves?: readonly DatapackId[];
    /** The SC's own datapacks' names: Keep Both's name may not be one of them. Must be stable. */
    ownNames?: readonly string[];
    /** A project's Datapacks: a clean load into My Datapacks goes on to install (F2). Absent in the Datapack Library. */
    onInstall?: (loaded: LoadedDatapack) => void;
}

const NO_SAVES: readonly DatapackId[] = [];
const NO_NAMES: readonly string[] = [];

/** Whether My Datapacks already holds the file's version. */
function alreadyHeld(file: OpenedFile | null, mySaves: readonly DatapackId[]): boolean {
    return file !== null && mySaves.some((id) => id.name === file.datapackName && id.version === file.version);
}

/** The name the SC knows the loaded datapack by: Keep Both's new name, else the file's. */
function loadedName(file: OpenedFile | null, outcome: LoadOutcome | null): string {
    return outcome?.displayName ?? file?.displayName ?? outcome?.datapackName ?? file?.datapackName ?? 'Datapack';
}

/**
 * Exactly what this load created in My Datapacks, for the one Delete: the datapack when the load
 * created it there, and the settings layer when the load created that. A layer left as it was, or
 * a pack the load updated, is not the load's to remove.
 */
function createdIds(outcome: LoadOutcome | null): DatapackId[] {
    if (!outcome) return [];
    const pack = outcome.target === 'library' && outcome.pack === 'created' ? [{ name: outcome.datapackName, version: outcome.version }] : [];
    const layer = outcome.settingsLayer?.outcome === 'created' ? [{ name: outcome.settingsLayer.datapackName, version: outcome.settingsLayer.version }] : [];
    return [...pack, ...layer];
}

/** Keep Both's name: what was typed, else where it starts ("My Luma 2"). */
function useCopyName(file: OpenedFile | null, ownNames: readonly string[]) {
    const [keepBoth, setKeepBoth] = useState(false);
    const [typed, setTyped] = useState<string | undefined>(undefined);
    const start = useMemo(() => copyName(file?.displayName ?? file?.datapackName ?? '', ownNames), [file, ownNames]);
    const name = typed ?? start;
    const room = useMemo(() => longestNameProblem(ownNames), [ownNames]);
    return { keepBoth, onKeepBoth: setKeepBoth, name, onName: setTyped, problem: nameProblem(name, ownNames), room };
}

export function AddDatapackFileModal({
    onClose,
    offersInstaller = INSTALLER_WRITES_SHOWN,
    mySaves = NO_SAVES,
    ownNames = NO_NAMES,
    onInstall,
}: AddDatapackFileModalProps): React.JSX.Element | null {
    const [target, setTarget] = useState<DatapackStoreName>('library');
    const opened = useDataInstallerRequest<OpenedFile>('open-datapack-zip');
    const loading = useDataInstallerRequest<LoadOutcome>('load-datapack-zip');

    const openFile = opened.load;
    useEffect(() => {
        openFile({});
    }, [openFile]);

    // A dismissed picker leaves nothing to load.
    useEffect(() => {
        if (opened.value?.cancelled) onClose();
    }, [opened.value, onClose]);

    const file = opened.value?.path ? opened.value : null;
    const held = alreadyHeld(file, mySaves);
    const copy = useCopyName(file, ownNames);
    const asks = held && target === 'library';
    const keepsBoth = asks && copy.keepBoth;
    const runLoad = loading.load;
    const load = useCallback((): void => {
        if (!file) return;
        runLoad({
            path: file.path,
            target,
            update: asks && !copy.keepBoth,
            ...(keepsBoth ? { saveAs: copy.name.trim() } : {}),
            ...(target === 'installer' ? { confirmName: file.datapackName } : {}),
        });
    }, [runLoad, file, target, asks, keepsBoth, copy.keepBoth, copy.name]);

    const outcome = loading.value;
    const undo = useMemo(() => createdIds(loading.failure ? null : outcome), [loading.failure, outcome]);
    const result = loadResult({ openError: opened.failure?.message, file, outcome, loadError: loading.failure?.message });
    // In a project's Datapacks a clean load into My Datapacks goes on to install it (F2).
    const installs = onInstall !== undefined && outcome?.target === 'library' && result?.variant === 'success';
    useEffect(() => {
        if (installs && outcome) onInstall({ id: { name: outcome.datapackName, version: outcome.version }, displayName: loadedName(file, outcome) });
    }, [installs, outcome, file, onInstall]);

    if (!opened.settled || opened.value?.cancelled || installs) return null;
    if (result) {
        return (
            <ResultDialog
                isOpen
                title={datapackResultWords(result).title}
                outcome={datapackResultWords(result).outcome}
                status={resultStatus(result) ?? 'warning'}
                rows={resultRows(outcome, undo, loadedName(file, outcome))}
                onClose={onClose}
            >
                {result.message}
            </ResultDialog>
        );
    }

    return (
        <FormDialog
            isOpen
            title="Add from File"
            submitLabel={asks && !copy.keepBoth ? 'Replace' : 'Add'}
            onSubmit={load}
            submitDisabled={!file || (keepsBoth && copy.problem !== undefined)}
            submitPending={loading.loading}
            onClose={onClose}
        >
            {file ? (
                <AddFileForm
                    file={file}
                    choice={{ target, held, onTarget: setTarget }}
                    copy={copy}
                    offersInstaller={offersInstaller}
                />
            ) : null}
        </FormDialog>
    );
}

/**
 * The outcome, once there is one: why the file would not open, or what was stored and each type
 * that was refused with its reason. Nothing while the form is still the thing to show.
 */
function loadResult(args: {
    openError?: string;
    file: OpenedFile | null;
    outcome: LoadOutcome | null;
    loadError?: string;
}): ResultContent | null {
    const { openError, file, outcome, loadError } = args;
    if (openError || !file) {
        return { variant: 'error', title: "Couldn't Open the File", thing: 'File', message: openError ?? 'No file was opened.' };
    }
    const name = loadedName(file, outcome);
    if (!outcome && !loadError) return null;
    const layer = outcome?.settingsLayer;
    const details = [
        ...(outcome?.failed ?? []).map((f) => `${dataTypeLabel(f.dataType)}: ${f.reason}`),
        ...(layer?.reason ? [`Store Configuration: ${layer.reason}`] : []),
    ];
    if (loadError) {
        return { variant: 'error', title: `Couldn't Add ${name}`, thing: name, message: loadError, details };
    }
    const stored = outcome?.stored.length ?? 0;
    const failed = outcome?.failed.length ?? 0;
    const landed = layer?.outcome === 'created' || layer?.outcome === 'updated';
    const where = loadedWhere(outcome?.target === 'installer', landed);
    if (details.length === 0) return { variant: 'success', title: `${name} Loaded`, thing: name, message: where };
    // Partly: the count says how much, the details say what was refused and why.
    const partly = failed > 0 ? `Loaded ${stored} of ${stored + failed} data types. ` : '';
    return { variant: 'warning', title: `${name} ${failed > 0 ? 'Partly Loaded' : 'Loaded'}`, thing: name, message: `${partly}${where}`, details };
}

/**
 * The result's lines (layout variant 6): a type the store refused, with its reason under it, and ONE
 * row for what this load created, with the one Delete that removes all of it (F2). The row is the
 * datapack by its name; when the load created only a settings layer (the data went to the Data
 * Installer, or replaced a datapack), it is that layer.
 */
function resultRows(outcome: LoadOutcome | null, created: readonly DatapackId[], name: string): ResultRow[] {
    const rows: ResultRow[] = (outcome?.failed ?? []).map((f) => ({ label: dataTypeLabel(f.dataType), status: 'warning', note: f.reason }));
    const layer = outcome?.settingsLayer;
    if (layer?.reason) rows.push({ label: 'Store Configuration', status: 'warning', note: layer.reason });
    if (outcome && created.length > 0) {
        const packCreated = created.some((id) => id.name === outcome.datapackName);
        // The SC never sees a version (D3): the datapack by its name alone.
        rows.push({ label: packCreated ? name : 'Store Configuration', status: 'success', action: <RemoveFromLibraryButton ids={created} /> });
    }
    return rows;
}

/** Where the file's parts went: the settings stay in My Datapacks wherever the data goes. */
function loadedWhere(intoInstaller: boolean, settingsLanded: boolean): string {
    if (intoInstaller) return `Added to the Data Installer.${settingsLanded ? ' Its store configuration is in My Datapacks.' : ''}`;
    return `Added to My Datapacks${settingsLanded ? ', with its store configuration' : ''}.`;
}
