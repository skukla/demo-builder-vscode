/**
 * What importing a pack the project has again would change, by data type, for the Import form
 * (owner, 2026-11-08, walk F56). Importing again updates and removes, not only adds: on 2026-11-06
 * one took 40 attributes out of their sets with nothing on screen beforehand (DI-8).
 *
 * The window opens on the house wait ("Comparing with Commerce", about a minute) while the preview
 * (`preview-datapack-changes`, the agent's `preview_datapack_changes`) reads the store against the
 * pack, then the form shows each data type's line ("12 updated, 2 removed", "No changes"). Import
 * then runs straight away. A first install has nothing to compare and never waits. Once anything
 * has run from the window the counts are out of date, so they are no longer shown.
 *
 * @module features/data-installer/ui/hooks/useImportChanges
 */

import { useEffect, useState } from 'react';
import type { ChangePreview } from '../../services/demoBuilderEngine/storeChanges';
import { libraryField } from '../components/importModalJob';
import { changeLines } from '../importChangeLines';
import { useDataInstallerRequest } from './useDataInstallerRequest';
import type { ModalWait } from '@/core/ui/components/ui/Modal';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { WAIT_STAGES } from '@/core/utils/waitStages';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

export interface ImportChangesArgs {
    id: DatapackId;
    source?: DatapackStoreName;
    /** The data types the form offers; a line is given for each. */
    types: readonly string[];
    /** The project has installed this pack (its install record names kinds). */
    installed: boolean;
    /** The form is the view showing. */
    active: boolean;
    /** Something has run from this window since it opened. */
    used: boolean;
}

export interface ImportChanges {
    /** The window's wait while the comparison runs, or false. */
    wait: ModalWait | false;
    /** Each data type's line, or null when there is nothing to show. */
    lines: Record<string, string> | null;
    /** The comparison could not be read. */
    failed: boolean;
}

const OPTIONS = { timeout: TIMEOUTS.DATAPACK_IMPORT_COMPARE };

export function useImportChanges(args: ImportChangesArgs): ImportChanges {
    const { id, source, types, installed, active, used } = args;
    const preview = useDataInstallerRequest<ChangePreview>('preview-datapack-changes', OPTIONS);
    const [asked, setAsked] = useState(false);
    const { load } = preview;
    const { name, version } = id;

    useEffect(() => {
        if (asked || !installed || !active || used) return;
        setAsked(true);
        load({ datapackName: name, version, ...libraryField(source) });
    }, [asked, installed, active, used, load, name, version, source]);

    const comparing = asked && !preview.settled;
    if (used) return { wait: false, lines: null, failed: false };
    return {
        wait: comparing && active ? WAIT_STAGES.checkingForChanges : false,
        lines: preview.value ? changeLines(preview.value.kinds, types) : null,
        failed: preview.failure !== null,
    };
}
