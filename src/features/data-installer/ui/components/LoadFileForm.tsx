/**
 * Add from File's form (split from `LoadDatapackFileModal` for step-07 F1): what is in the file, where
 * it goes, and, when My Datapacks already holds the file's version, Replace or Keep Both (P4-Q10).
 *
 * Keep Both adds the file as a new datapack under the name in its box, which starts by the taken-name
 * rule the save question uses (J7-2; decisions "Back on track"): "My Luma 2", then "My Luma 3"
 * (`copyName`). A name the SC already has shows the house problem line under the box and Load waits.
 * The box's room is kept from the first frame, Replace chosen or not, so choosing Keep Both moves
 * nothing (prototype-conventions rule 14): the house's `modal-steps` cell, as `NameField` keeps the
 * room for its own problem line.
 *
 * The Data Installer is a destination only under `INSTALLER_WRITES_SHOWN` (see the modal).
 *
 * @module features/data-installer/ui/components/LoadFileForm
 */

import { Radio, RadioGroup } from '@adobe/react-spectrum';
import React from 'react';
import { configurationSettingsCount } from '../../datapackWords';
import { isSavedVersion, packLine, versionLabel } from '../../packVersions';
import { dataTypeLabel } from '../dataTypeLabel';
import { NameField } from './save/NameField';
import { LeadText } from '@/core/ui/components/ui/LeadText';
import type { DatapackStoreName } from '@/types/datapack';

/** What `open-datapack-zip` says about a file. */
export interface OpenedFile {
    cancelled?: boolean;
    path?: string;
    datapackName?: string;
    version?: string;
    displayName?: string;
    dataTypes?: string[];
    settingsLayer?: { paths: string[] };
}

export interface TargetChoice {
    target: DatapackStoreName;
    /** My Datapacks already holds this version: the load asks Replace or Keep Both. */
    held: boolean;
    onTarget: (target: DatapackStoreName) => void;
}

/** Replace or Keep Both, and Keep Both's name with why it cannot be used. */
export interface CopyChoice {
    keepBoth: boolean;
    onKeepBoth: (keepBoth: boolean) => void;
    name: string;
    onName: (name: string) => void;
    /** Why the name cannot be used, as the house problem line says it; none when it can. */
    problem?: string;
    /** The longest reason it could give: the room kept under the box. */
    room: string;
}

const NO_CHANGE = (): void => undefined;

/** "My Luma, saved Nov 9, 9:15 AM" or "Luma, main": a save by its date, never its id. */
function fileLine(file: OpenedFile): string {
    const name = file.displayName ?? file.datapackName ?? '';
    const version = file.version ?? '';
    if (!version) return name;
    return isSavedVersion(version)
        ? `${name}, saved ${versionLabel(version)}`
        : packLine(name, version);
}

/** What is in the file, where it should go, and Replace or Keep Both when it is already there. */
export function LoadFileForm({
    file,
    choice,
    copy,
    offersInstaller,
}: {
    file: OpenedFile;
    choice: TargetChoice;
    copy: CopyChoice;
    offersInstaller: boolean;
}): React.JSX.Element {
    const types = (file.dataTypes ?? []).map(dataTypeLabel).join(', ');
    const asks = choice.held && choice.target === 'library';
    return (
        <>
            <LeadText>
                {fileLine(file)}. It holds {types}.{asks ? " It's already in My Datapacks." : ''}
            </LeadText>
            {file.settingsLayer ? (
                <p className="dialog-note">
                    Its store configuration (
                    {configurationSettingsCount(file.settingsLayer.paths.length).toLowerCase()})
                    goes into My Datapacks.
                </p>
            ) : null}
            {offersInstaller ? (
                <DestinationChoice name={file.datapackName} choice={choice} />
            ) : null}
            {asks ? <KeepBothChoice copy={copy} /> : null}
        </>
    );
}

/** Replace or Keep Both; Keep Both's name box, its room held whichever is chosen. */
function KeepBothChoice({ copy }: { copy: CopyChoice }): React.JSX.Element {
    return (
        <>
            <RadioGroup
                aria-label="Replace or Keep Both"
                value={copy.keepBoth ? 'keep-both' : 'replace'}
                onChange={(value) => copy.onKeepBoth(value === 'keep-both')}
            >
                <Radio value="replace">Replace</Radio>
                <Radio value="keep-both">Keep Both</Radio>
            </RadioGroup>
            <div className="modal-steps">
                <div>
                    {copy.keepBoth ? (
                        <NameField
                            name={copy.name}
                            onChange={copy.onName}
                            {...(copy.problem ? { error: copy.problem } : {})}
                            room={copy.room}
                        />
                    ) : null}
                </div>
                <div className="modal-steps-ghost" aria-hidden="true">
                    <NameField name="" onChange={NO_CHANGE} room={copy.room} />
                </div>
            </div>
        </>
    );
}

/** My Datapacks or the Data Installer, only while the Data Installer takes our writes. */
function DestinationChoice({
    name,
    choice,
}: {
    name?: string;
    choice: TargetChoice;
}): React.JSX.Element {
    return (
        <>
            <RadioGroup
                label="Destination"
                value={choice.target}
                onChange={(value) => choice.onTarget(value as DatapackStoreName)}
            >
                <Radio value="library">My Datapacks (Private Until Shared)</Radio>
                <Radio value="installer">Data Installer (Shared Catalog)</Radio>
            </RadioGroup>
            {choice.target === 'installer' ? (
                <p className="dialog-note">
                    Other teams will see {name} in the shared catalog. If that name and version
                    already exist there, nothing is changed.
                </p>
            ) : null}
        </>
    );
}
