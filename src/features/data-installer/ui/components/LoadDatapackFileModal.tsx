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
import type { DatapackStoreName } from '../../types';
import { dataTypeLabel } from '../dataTypeLabel';
import { useDataInstallerRequest } from '../hooks/useDataInstallerRequest';
import { UndoLibraryLoadButton } from './UndoLibraryLoadButton';
import { StatusDisplay } from '@/core/ui/components/feedback/StatusDisplay';
import { Modal } from '@/core/ui/components/ui/Modal';

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
    const done = Boolean(loading.value ?? loading.failure);

    return (
        <DialogContainer onDismiss={onClose}>
            <Modal
                title="Load a datapack file"
                onClose={onClose}
                closeLabel="Close"
                actionButtons={
                    done || !file
                        ? [{ label: 'Done', variant: 'secondary', onPress: onClose }]
                        : [
                              {
                                  label: loading.loading ? 'Loading' : 'Load',
                                  variant: 'accent',
                                  onPress: load,
                                  isDisabled: loading.loading,
                              },
                          ]
                }
            >
                <div className="datapack-export-body">
                    {renderBody({
                        openError: opened.failure?.message,
                        file,
                        done,
                        outcome: loading.value,
                        loadError: loading.failure?.message,
                        choice: { target, update, onTarget: setTarget, onUpdate: setUpdate },
                    })}
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

/** The one state to show: why the file would not open, the choice, or what happened. */
function renderBody(args: {
    openError?: string;
    file: OpenedFile | null;
    done: boolean;
    outcome: LoadOutcome | null;
    loadError?: string;
    choice: TargetChoice;
}): React.JSX.Element {
    const { openError, file, done, outcome, loadError, choice } = args;
    if (openError || !file) {
        return (
            <StatusDisplay
                variant="error"
                title="This file cannot be loaded"
                message={openError ?? 'No file was opened.'}
            />
        );
    }
    if (done) {
        return <LoadResult outcome={outcome} error={loadError} />;
    }
    return <LoadForm file={file} choice={choice} />;
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

/** What was stored, and each type that was refused with its reason. */
function LoadResult({
    outcome,
    error,
}: {
    outcome: LoadOutcome | null;
    error?: string;
}): React.JSX.Element {
    const failed = (outcome?.failed ?? []).map((f) => `${dataTypeLabel(f.dataType)}: ${f.reason}`);
    if (error) {
        return (
            <StatusDisplay
                variant="error"
                title="The file was not loaded"
                message={error}
                details={failed}
            />
        );
    }
    const where = outcome?.target === 'installer' ? 'the Data Installer' : 'the datapack library';
    const total = (outcome?.stored.length ?? 0) + failed.length;
    // Only an exact undo is offered: a pack this load CREATED in the library.
    const undoable = outcome?.target === 'library' && outcome.pack === 'created';
    return (
        <>
            <StatusDisplay
                variant={failed.length === 0 ? 'success' : 'warning'}
                title={`Loaded ${outcome?.stored.length ?? 0} of ${total} data types into ${where}`}
                details={failed}
            />
            {undoable ? (
                <UndoLibraryLoadButton
                    id={{ name: outcome.datapackName, version: outcome.version }}
                />
            ) : null}
        </>
    );
}
