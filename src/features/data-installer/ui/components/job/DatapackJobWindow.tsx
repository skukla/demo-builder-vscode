/**
 * A datapack job's window host (step 03, S4, S6 and S7): ONE `DialogContainer`, and in it the one window
 * the job's phase is on (`datapackJob.ts`), each a shared layout. It picks windows and nothing more:
 * the requests and the events they send are `useDatapackJob`'s, the bodies are each window's.
 *
 *   check, summary, dry wait → `JobSummaryWindow`   records → `RecordsWindow`
 *   dry result → `DryRunWindow`   save question → `SaveFirstWindow` (core) over `SaveChangesBody`
 *   run, an end with a problem → `DatapackRunWindow`
 *   a clean end, a start that never ran, no instance → `JobResultWindow`
 *   Restore's check and question → `RestorePhase`
 *
 * Serves a first install of a pack the project does not hold; a switch over the datapack it holds
 * ("Switch to Bodea?", then "Save Your Changes First?" when it has changes; decisions J2-3, J8-1),
 * which for another version of the held datapack keeps Install's words ("Install Bodea,
 * eds-compatible?", Install, "Installing ..."; walked by nobody yet, the plan's Q11); an uninstall
 * ("Uninstall My Luma?" over what its record lists, a red Uninstall, the same save question, and
 * its run as steps; J5-1, J5-2); a restore of the datapack the demo uses ("Restore My Luma" while
 * it checks, "Restore My Luma?" over unsaved edits, "My Luma Is Up to Date" when there is nothing to
 * do, else its run; S8, J4-2 to J4-4); and a job already running when it opened (Undo, an agent's),
 * titled by what that job is for (`jobWords`). Closing a job still running hands it to a progress notification, as every
 * progress window does: nothing is cancelled, since there is nothing to cancel with.
 *
 * The phases' windows are their own files: `SummaryPhase`, `RunPhase`, `ResultPhase` (with the
 * end buttons), `RestorePhase`, and `jobOpened` for what the window was opened for.
 *
 * @module features/data-installer/ui/components/job/DatapackJobWindow
 */

import { DialogContainer } from '@adobe/react-spectrum';
import React from 'react';
import {
    INSTALL,
    jobWords,
    RESTORE,
    saveFirstLabel,
    UNINSTALL,
    withoutSavingLabel,
} from '../../../datapackWords';
import { packLine } from '../../../packVersions';
import { useDatapackJob, type DatapackJob } from '../../hooks/useDatapackJob';
import { useRunColumns } from '../../hooks/useRunColumns';
import { useVersionTypes } from '../../hooks/useVersionTypes';
import type { ResultContent } from '../importResult';
import { DryRunWindow } from './DryRunWindow';
import { type Opened, runningPurpose } from './jobOpened';
import { JobResultWindow } from './JobResultWindow';
import { RecordsWindow } from './RecordsWindow';
import { RestorePhase } from './RestorePhase';
import { ResultPhase } from './ResultPhase';
import { type RunShape, RunPhase } from './RunPhase';
import { SaveChangesBody } from './SaveChangesBody';
import { SummaryPhase, summaryFrame } from './SummaryPhase';
import { SaveFirstWindow } from '@/core/ui/components/feedback/SaveFirstWindow';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DATAPACK_OPERATION_ID } from '@/core/utils/operationIds';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

export interface DatapackJobWindowProps {
    id: DatapackId;
    displayName: string;
    /** The data types the version holds, when the opener read them; else read here. */
    types?: string[];
    source?: DatapackStoreName;
    /** An install starts at its check; a job already running at its run. */
    startsAt: 'check' | 'run';
    /**
     * A switch over the datapack the project holds (S6): the SC's own datapacks' names; `Install`
     * when it is another version of the same datapack, which keeps Install's words.
     */
    switching?: { ownNames: string[]; verb?: 'Install' };
    /** An uninstall of the datapack the window opened on (S7): the SC's own datapacks' names. */
    uninstalling?: { ownNames: string[] };
    /** Restore on the datapack the demo uses (S8): its check, then its question or its run. */
    restoring?: true;
    onClose: () => void;
}

const NO_INSTANCE: ResultContent = {
    variant: 'warning',
    title: 'No Commerce Instance',
    message: 'Connect Commerce on the project dashboard first.',
};
const NO_RECORDS: Record<string, string[]> = {};
const NO_NAMES: string[] = [];

/** What the window was opened for. */
function openedAs(props: DatapackJobWindowProps): Opened {
    const { startsAt, switching, uninstalling, restoring, displayName, id } = props;
    if (startsAt === 'run') return { kind: 'watch', verb: INSTALL, name: displayName };
    if (restoring) return { kind: 'restore', verb: RESTORE, name: displayName };
    if (uninstalling) return { kind: 'uninstall', verb: UNINSTALL, name: displayName };
    if (switching?.verb) return { kind: 'switch', verb: INSTALL, name: packLine(displayName, id.version) };
    if (switching) return { kind: 'switch', verb: 'Switch', name: displayName };
    return { kind: 'install', verb: INSTALL, name: displayName };
}

/** "Save Your Changes First?": the shared frame in the job's verb, over the changes by type. */
function saveFirstWindow(job: DatapackJob, opened: Opened, close: () => void): React.ReactElement {
    const { changes, answer } = job.switching;
    return (
        <SaveFirstWindow
            withoutSavingLabel={withoutSavingLabel(opened.verb)}
            saveLabel={saveFirstLabel(opened.verb, false)}
            saveDisabled={changes.saveAs?.problem !== undefined}
            onAnswer={answer}
            onClose={close}
        >
            <SaveChangesBody
                rows={changes.rows}
                readFailed={changes.readFailed}
                {...(changes.saveAs ? { saveAs: changes.saveAs } : {})}
            />
        </SaveFirstWindow>
    );
}

/** The windows that leave the summary and come back: Review Records, a Dry Run's answer, the save question. */
function asideWindow(job: DatapackJob, opened: Opened, close: () => void): React.ReactElement | null {
    const { phase } = job.state;
    if (phase === 'records') {
        const records = job.recordsReading ? NO_RECORDS : job.records;
        const { title } = summaryFrame(job, opened, false);
        return <RecordsWindow title={title} rows={job.rows} records={records} reading={job.recordsReading} onBack={job.back} onClose={close} />;
    }
    if (phase === 'dry-result' && job.result) {
        return <DryRunWindow result={job.result} onBack={job.back} onInstall={job.install} onRetry={job.dryRun} onFix={job.fixDryRun} onClose={close} />;
    }
    if (phase === 'save-first') return saveFirstWindow(job, opened, close);
    return null;
}

/** The one window the job's phase is on. */
function windowFor(job: DatapackJob, run: RunShape, opened: Opened, close: () => void): React.ReactElement {
    const { phase } = job.state;
    const aside = asideWindow(job, opened, close);
    if (aside) return aside;
    if (phase === 'no-instance') return <JobResultWindow result={NO_INSTANCE} onClose={close} />;
    if ((phase === 'done' || phase === 'ended') && job.result && !job.result.run)
        return <ResultPhase job={job} result={job.result} onClose={close} />;
    if (phase === 'run' || phase === 'ended') return <RunPhase job={job} run={run} opened={opened} onClose={close} />;
    if (opened.kind === 'restore')
        return <RestorePhase job={job} name={opened.name} onClose={close} />;
    return <SummaryPhase job={job} opened={opened} onClose={close} />;
}

export function DatapackJobWindow(props: DatapackJobWindowProps): React.ReactElement {
    const { id, displayName, types: given, source, switching, uninstalling, onClose } = props;
    const { types, reading } = useVersionTypes(id, source, given);
    const columns = useRunColumns(types.length);
    const opened = openedAs(props);
    const ownNames = switching?.ownNames ?? uninstalling?.ownNames ?? NO_NAMES;
    const job = useDatapackJob({
        id,
        displayName: opened.name,
        source,
        types,
        readingTypes: reading,
        kind: opened.kind,
        ownNames,
    });

    // Closing a job still running, or still starting (a save first included), hands it over.
    const close = (): void => {
        if (job.state.phase === 'run' && (job.running || job.starting)) {
            const title = jobWords(runningPurpose(job, opened), opened.name).running;
            webviewClient.postMessage('backgroundOperation', { id: DATAPACK_OPERATION_ID, title });
        }
        onClose();
    };

    const run = { name: displayName, version: id.version, types, columns };
    return <DialogContainer onDismiss={close}>{windowFor(job, run, opened, close)}</DialogContainer>;
}
