/**
 * A datapack step named for its pack: "Uninstalling We.Cafe", then "Installing Frescopa" (owner,
 * 2026-11-16: "the datapack" twice said nothing about which). Its own file so the stage table
 * stays within its size limit; the table maps a named step back to itself (`baseStage`).
 *
 * @module core/utils/packStage
 */

import { CREATION_STAGES } from './creationStages';

/** The datapack steps that carry their pack's name when it is known. */
const NAMED_STAGES = [CREATION_STAGES.installingDatapack, CREATION_STAGES.removingDatapack] as const;

/** A label's first word: "Installing" of "Installing the datapack". */
const verbOf = (label: string): string => label.slice(0, label.indexOf(' '));

/**
 * The step named for its pack, or the table's label without a name.
 *
 * @param stage - the install or uninstall step
 * @param name - the pack's name as the SC knows it, when known
 */
export function packStage(stage: (typeof NAMED_STAGES)[number], name: string | undefined): string {
    return name ? `${verbOf(stage.label)} ${name}` : stage.label;
}

/**
 * The table label a named step stands for, or undefined for any other text. The caller checks the
 * table first, so a table label that shares a first word ("Installing dependencies") is itself.
 */
export function namedStageBase(stage: string): string | undefined {
    return NAMED_STAGES.find((named) => stage.startsWith(`${verbOf(named.label)} `))?.label;
}
