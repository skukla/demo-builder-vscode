/**
 * Which website an install record, and a project, is on: the one reading every Clear door shares
 * (datapack-engine step 10; datapack-simplification step 06). A record names its own website
 * (`target.websiteCode`); one that names none is read at its project's own (rule 3, as every record
 * reader does); one whose website nothing says is on no known website.
 *
 * @module features/data-installer/services/demoDataWipe/recordWebsites
 */

import type { InstallRecord } from '../demoBuilderEngine/installRecord';
import { resolveInstallTarget } from '../sampleDataInstall';
import type { Project } from '@/types/base';
import type { DatapackId } from '@/types/datapack';

/** Whether the record is the named pack's. */
export const isPack = (record: InstallRecord, pack: DatapackId | undefined): boolean =>
    pack !== undefined && record.pack.name === pack.name && record.pack.version === pack.version;

/** The website a record is on: its own, else its project's; undefined when nothing says. */
export const websiteOf = (record: InstallRecord, owner: Project): string | undefined =>
    record.target?.websiteCode ?? resolveInstallTarget(owner)?.websiteCode;

/** Every website a project uses: its install target's, and each its install records were installed to. Sorted, each once. */
export function projectWebsites(project: Project, records: readonly InstallRecord[]): string[] {
    const own = resolveInstallTarget(project)?.websiteCode;
    const codes = [own, ...records.map((r) => r.target?.websiteCode)].filter((code): code is string => code !== undefined && code !== '');
    return [...new Set(codes)].sort();
}
