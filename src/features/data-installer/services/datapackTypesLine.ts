/**
 * The line under a datapack step ('Installing the datapack', 'Removing the sample
 * data', and since 2026-11-04 'Reading from Commerce' and 'Verifying demo data'): how
 * many of its data types are finished, and the ones in flight.
 *
 * One wording for project creation, Reset's removal, the datapack's own modal and the
 * notification it hands over to (progress vocabulary slice 5, owner 2026-10-16). A
 * count of items goes here, on line 2, never as the step's position: "Importing the
 * sample data (3 of 14)" read as the third of fourteen steps. vscode-free, so the
 * modal's webview can use it.
 *
 * @module features/data-installer/services/datapackTypesLine
 */

import { dataTypeLabel } from '../ui/dataTypeLabel';
import { countLine } from '@/core/utils/storefrontJobs';

/**
 * @param done - types finished, whether or not each went well
 * @param total - types in the job
 * @param processing - the friendly names of the types in flight right now
 * @returns "3 of 14 data types: Products, Categories", or the count alone between types
 */
export function typesLine(done: number, total: number, processing: readonly string[]): string {
    const count = countLine(done, total, 'data type');
    return processing.length > 0 ? `${count}: ${processing.join(', ')}` : count;
}

/**
 * The same line for a run that goes through its data types in a fixed order of reads, a few at a
 * time (a save's read, the clearing's check): those before this read are done.
 *
 * @param phases - each read, as the data type codes it covers
 * @param at - the read starting now
 * @returns "3 of 12 data types: Product Attributes"
 */
export function phaseLine(phases: readonly (readonly string[])[], at: number): string {
    const done = phases.slice(0, at).flat().length;
    return typesLine(done, phases.flat().length, (phases[at] ?? []).map(dataTypeLabel));
}
