/**
 * "Load from file" — put the pack in a datapack zip into one of the two stores.
 *
 * Opening the modal opens VS Code's file picker (the host's dialog, via
 * `open-datapack-zip`), which reads the file and says what is in it WITHOUT writing
 * anything. Only then does the SC choose where it goes and press Load. Dismissing
 * the picker closes the modal: there is nothing to show without a file.
 *
 * A loaded pack goes into My Datapacks, private to the SC until they share it. The Data
 * Installer is offered as a second destination only under `INSTALLER_WRITES_SHOWN`, the switch
 * that hides Copy to the Data Installer, since our accounts cannot write there yet and loading
 * into it would fail every time. When it is offered, the choice is spelled out because the two
 * differ in who sees the result: the Data Installer's catalog is shared with other teams, so
 * choosing it is the confirmation (the handler also wants the pack's name back, which this
 * sends). Replacing an existing version is offered for My Datapacks only — the Data Installer
 * cannot tell whose pack is whose, and the handler refuses it there.
 *
 * Loading writes a pack into a store; it installs nothing into Commerce. That is
 * still the catalog's Import.
 *
 * A file can carry the pack's settings layer as a second section (datapack-engine step 09). The
 * form says so, since the layer goes to the library whichever store the SC chooses, and the result
 * offers its own undo unless removing the pack takes it (a layer of the same version does).
 *
 * @module features/data-installer/ui/components/LoadDatapackFileModal
 */

import { Checkbox, DialogContainer, Radio, RadioGroup } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
import { configurationSettingsCount } from '../../datapackWords';
import { INSTALLER_WRITES_SHOWN } from '../../installerWrites';
import { isSavedVersion, packLine, versionLabel } from '../../packVersions';
import { dataTypeLabel } from '../dataTypeLabel';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { DatapackResultBody } from './DatapackResultBody';
import { type ResultContent, resultStatus } from './importResult';
import { RemoveFromLibraryButton } from './RemoveFromLibraryButton';
import { Modal } from '@/core/ui/components/ui/Modal';
import type { DatapackStoreName } from '@/types/datapack';

/** What `open-datapack-zip` says about a file. */
interface OpenedFile {
    cancelled?: boolean;
    path?: string;
    datapackName?: string;
    version?: string;
    displayName?: string;
    dataTypes?: string[];
    settingsLayer?: { paths: string[] };
}

/** What loading the file's settings layer did. */
interface LoadedLayer {
    datapackName: string;
    version: string;
    outcome: 'created' | 'updated' | 'left' | 'failed';
    reason?: string;
}

/** What `load-datapack-zip` did. */
interface LoadOutcome {
    datapackName: string;
    version: string;
    target: DatapackStoreName;
    pack: 'created' | 'updated';
    stored: string[];
    failed: Array<{ dataType: string; reason: string }>;
    settingsLayer?: LoadedLayer;
}

/** The undo for a layer this load created, unless removing the pack takes it. */
function layerToUndo(outcome: LoadOutcome | null, packUndoable: boolean): LoadedLayer | undefined {
    const layer = outcome?.settingsLayer;
    if (layer?.outcome !== 'created') return undefined;
    return packUndoable && layer.version === outcome?.version ? undefined : layer;
}

export interface LoadDatapackFileModalProps {
    /** Closed, with or without a load. The caller refreshes what it shows. */
    onClose: () => void;
    /** Whether the Data Installer is offered as a destination; off while our accounts cannot write there. */
    offersInstaller?: boolean;
}

export function LoadDatapackFileModal({
    onClose,
    offersInstaller = INSTALLER_WRITES_SHOWN,
}: LoadDatapackFileModalProps): React.JSX.Element | null {
    const [target, setTarget] = useState<DatapackStoreName>('library');
    const [update, setUpdate] = useState(false);
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
    const runLoad = loading.load;
    const load = useCallback((): void => {
        if (!file) return;
        runLoad({
            path: file.path,
            target,
            update: target === 'library' && update,
            ...(target === 'installer' ? { confirmName: file.datapackName } : {}),
        });
    }, [runLoad, file, target, update]);

    if (!opened.settled || opened.value?.cancelled) return null;
    const outcome = loading.value;
    const result = loadResult({ openError: opened.failure?.message, file, outcome, loadError: loading.failure?.message });
    // Only an exact undo is offered: a pack this load CREATED in the library.
    const undoable = !loading.failure && outcome?.target === 'library' && outcome.pack === 'created';
    const undoLayer = layerToUndo(outcome, undoable);

    return (
        <DialogContainer onDismiss={onClose}>
            <Modal
                title={result?.title ?? 'Add from File'}
                status={result ? resultStatus(result) : undefined}
                size={result ? 'S' : 'M'}
                fitContent
                onClose={onClose}
                closeLabel="Close"
                actionButtons={
                    file && !result
                        ? [{ label: 'Load', variant: 'accent', onPress: load, isPending: loading.loading }]
                        : []
                }
            >
                <div className="datapack-export-body">
                    {file && !result ? (
                        <LoadForm
                            file={file}
                            choice={{ target, update, onTarget: setTarget, onUpdate: setUpdate }}
                            offersInstaller={offersInstaller}
                        />
                    ) : null}
                    {result ? <DatapackResultBody result={result} /> : null}
                    {result && undoable ? (
                        <RemoveFromLibraryButton id={{ name: outcome.datapackName, version: outcome.version }} />
                    ) : null}
                    {result && undoLayer ? (
                        <RemoveFromLibraryButton id={{ name: undoLayer.datapackName, version: undoLayer.version }} label="Delete Store Configuration" />
                    ) : null}
                </div>
            </Modal>
        </DialogContainer>
    );
}

interface TargetChoice {
    target: DatapackStoreName;
    update: boolean;
    onTarget: (target: DatapackStoreName) => void;
    onUpdate: (update: boolean) => void;
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
        return { variant: 'error', title: "Couldn't Open the File", message: openError ?? 'No file was opened.' };
    }
    const name = file.displayName ?? file.datapackName ?? 'Datapack';
    if (!outcome && !loadError) return null;
    const layer = outcome?.settingsLayer;
    const details = [
        ...(outcome?.failed ?? []).map((f) => `${dataTypeLabel(f.dataType)}: ${f.reason}`),
        ...(layer?.reason ? [`Store Configuration: ${layer.reason}`] : []),
    ];
    if (loadError) {
        return { variant: 'error', title: `Couldn't Load ${name}`, message: loadError, details };
    }
    const stored = outcome?.stored.length ?? 0;
    const failed = outcome?.failed.length ?? 0;
    const landed = layer?.outcome === 'created' || layer?.outcome === 'updated';
    const where = loadedWhere(outcome?.target === 'installer', landed);
    if (details.length === 0) return { variant: 'success', title: `${name} Loaded`, message: where };
    // Partly: the count says how much, the details say what was refused and why.
    const partly = failed > 0 ? `Loaded ${stored} of ${stored + failed} data types. ` : '';
    return { variant: 'warning', title: `${name} ${failed > 0 ? 'Partly Loaded' : 'Loaded'}`, message: `${partly}${where}`, details };
}

/** Where the file's parts went: the settings stay in My Datapacks wherever the data goes. */
function loadedWhere(intoInstaller: boolean, settingsLanded: boolean): string {
    if (intoInstaller) return `Added to the Data Installer.${settingsLanded ? ' Its store configuration is in My Datapacks.' : ''}`;
    return `Added to My Datapacks${settingsLanded ? ', with its store configuration' : ''}.`;
}

/** "My Luma, saved Nov 9, 9:15 AM" or "Luma, main": a save by its date, never its id. */
function fileLine(file: OpenedFile): string {
    const name = file.displayName ?? file.datapackName ?? '';
    const version = file.version ?? '';
    if (!version) return name;
    return isSavedVersion(version) ? `${name}, saved ${versionLabel(version)}` : packLine(name, version);
}

/** What is in the file, and where it should go. */
function LoadForm({ file, choice, offersInstaller }: { file: OpenedFile; choice: TargetChoice; offersInstaller: boolean }): React.JSX.Element {
    const types = (file.dataTypes ?? []).map(dataTypeLabel).join(', ');
    return (
        <>
            <p className="datapack-export-intro">
                {fileLine(file)}. It holds {types}.
            </p>
            {file.settingsLayer ? (
                <p className="datapack-export-note">
                    Its store configuration ({configurationSettingsCount(file.settingsLayer.paths.length).toLowerCase()}) goes into My Datapacks.
                </p>
            ) : null}
            {offersInstaller ? <DestinationChoice name={file.datapackName} choice={choice} /> : (
                <Checkbox isSelected={choice.update} onChange={choice.onUpdate}>
                    Replace Existing Version
                </Checkbox>
            )}
        </>
    );
}

/** My Datapacks or the Data Installer, only while the Data Installer takes our writes. */
function DestinationChoice({ name, choice }: { name?: string; choice: TargetChoice }): React.JSX.Element {
    return (
        <>
            <RadioGroup
                label="Destination"
                value={choice.target}
                onChange={(value) => choice.onTarget(value as DatapackStoreName)}
            >
                <Radio value="library">
                    My Datapacks (Private Until Shared)
                </Radio>
                <Radio value="installer">Data Installer (Shared Catalog)</Radio>
            </RadioGroup>
            {choice.target === 'library' ? (
                <Checkbox isSelected={choice.update} onChange={choice.onUpdate}>
                    Replace Existing Version
                </Checkbox>
            ) : (
                <p className="datapack-export-note">
                    Other teams will see {name} in the shared catalog. If that name and
                    version already exist there, nothing is changed.
                </p>
            )}
        </>
    );
}
