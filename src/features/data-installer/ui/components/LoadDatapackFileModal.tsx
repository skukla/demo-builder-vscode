/**
 * "Load from file" — put the pack in a datapack zip into one of the two stores.
 *
 * Opening the modal opens VS Code's file picker (the host's dialog, via
 * `open-datapack-zip`), which reads the file and says what is in it WITHOUT writing
 * anything. Only then does the SC choose where it goes and press Load. Dismissing
 * the picker closes the modal: there is nothing to show without a file.
 *
 * Two stores, and the choice is spelled out because they differ in who sees the
 * result: the datapack library keeps a loaded pack private to the SC until they
 * share it; the Data Installer's catalog is shared with other teams, so choosing it
 * is the confirmation (the handler also wants the pack's name back, which this
 * sends). Replacing an existing version is offered for the library only — the Data
 * Installer cannot tell whose pack is whose, and the handler refuses it there.
 *
 * Loading writes a pack into a store; it installs nothing into Commerce. That is
 * still the catalog's Import.
 *
 * @module features/data-installer/ui/components/LoadDatapackFileModal
 */

import { Checkbox, DialogContainer, Radio, RadioGroup } from '@adobe/react-spectrum';
import React, { useCallback, useEffect, useState } from 'react';
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
}

/** What `load-datapack-zip` did. */
interface LoadOutcome {
    datapackName: string;
    version: string;
    target: DatapackStoreName;
    pack: 'created' | 'updated';
    stored: string[];
    failed: Array<{ dataType: string; reason: string }>;
}

export interface LoadDatapackFileModalProps {
    /** Closed, with or without a load. The caller refreshes what it shows. */
    onClose: () => void;
}

export function LoadDatapackFileModal({
    onClose,
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

    return (
        <DialogContainer onDismiss={onClose}>
            <Modal
                title={result?.title ?? 'Load a datapack file'}
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
                        />
                    ) : null}
                    {result ? <DatapackResultBody result={result} /> : null}
                    {result && undoable ? (
                        <RemoveFromLibraryButton id={{ name: outcome.datapackName, version: outcome.version }} />
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
        return { variant: 'error', title: 'This file cannot be loaded', message: openError ?? 'No file was opened.' };
    }
    if (!outcome && !loadError) return null;
    const details = (outcome?.failed ?? []).map((f) => `${dataTypeLabel(f.dataType)}: ${f.reason}`);
    if (loadError) {
        return { variant: 'error', title: 'The file was not loaded', message: loadError, details };
    }
    const where = outcome?.target === 'installer' ? 'the Data Installer' : 'the datapack library';
    const stored = outcome?.stored.length ?? 0;
    return {
        variant: details.length === 0 ? 'success' : 'warning',
        title: `Loaded ${stored} of ${stored + details.length} data types into ${where}`,
        details,
    };
}

/** What is in the file, and where it should go. */
function LoadForm({ file, choice }: { file: OpenedFile; choice: TargetChoice }): React.JSX.Element {
    const types = (file.dataTypes ?? []).map(dataTypeLabel).join(', ');
    return (
        <>
            <p className="datapack-export-intro">
                {file.displayName} ({file.datapackName}, version {file.version}) holds: {types}.
            </p>
            <RadioGroup
                label="Load it into"
                value={choice.target}
                onChange={(value) => choice.onTarget(value as DatapackStoreName)}
            >
                <Radio value="library">
                    The datapack library: private to you until you share it
                </Radio>
                <Radio value="installer">The Data Installer: the catalog other teams share</Radio>
            </RadioGroup>
            {choice.target === 'library' ? (
                <Checkbox isSelected={choice.update} onChange={choice.onUpdate}>
                    If this version is already in the library, replace its data with this file
                </Checkbox>
            ) : (
                <p className="datapack-export-note">
                    Other teams will see {file.datapackName} in the shared catalog. If that name and
                    version already exist there, nothing is changed.
                </p>
            )}
        </>
    );
}
