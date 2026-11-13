/**
 * What a datapack job window was opened for (step 03, S4, S6 and S7), and what the job running is
 * for: its record's purpose once recorded, else the window's. Split out of `DatapackJobWindow`,
 * which works out the `Opened` from its props; the phase windows read it.
 *
 * @module features/data-installer/ui/components/job/jobOpened
 */

import { type DatapackVerb, jobPurpose } from '../../../datapackWords';
import type { JobPurpose } from '../../../types';
import type { DatapackJob } from '../../hooks/useDatapackJob';
import type { JobKind } from './datapackJob';

/** What the window was opened for, in the words it uses: its kind, verb and name. */
export interface Opened {
    kind: JobKind;
    verb: DatapackVerb;
    /** The datapack as titles name it: "Bodea", or "Bodea, eds-compatible" for another version. */
    name: string;
}

/** What the job is for before its record says: a switch, an uninstall, else an install. */
function purposeOf(opened: Opened): JobPurpose {
    if (opened.kind === 'uninstall') return 'uninstall';
    return opened.verb === 'Switch' ? 'switch' : 'install';
}

/** What the job running is for: its record's purpose once it is recorded, else what the window opened for. */
export function runningPurpose(job: DatapackJob, opened: Opened): JobPurpose {
    return job.record?.outcome === 'watching' ? jobPurpose(job.record) : purposeOf(opened);
}
