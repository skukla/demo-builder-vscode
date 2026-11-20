/**
 * Whether a pack is already installed somewhere this install or removal does not name: another
 * Commerce instance, another website or another store view. Its own file so the engine keeps to
 * installing (the engine is at its size limit).
 *
 * @module features/data-installer/services/demoBuilderEngine/engineElsewhere
 */

import type { ImportRequest } from '../importRequest';
import { installedOnAnotherInstanceLine, onAnotherInstance } from '../instanceKey';
import type { DemoBuilderEngineDeps } from './engine';
import { type TargetCodes, nodeRecordFiles, readInstallRecord } from './installRecord';
import { settingsWebsite } from './storeConfigKind';
import { nameInStore } from './storeNames';
import type { DatapackId } from '@/types/datapack';

/**
 * Why the pack cannot be installed to this target, when the record says it is installed elsewhere:
 * a repeat install compares what it made where it made it, and one record spans one website. A
 * record made before the target was kept says it by the website its settings went to. The pack is
 * named as the SC knows it (`nameOf`), never by `name@version`.
 */
export async function elsewhere(deps: DemoBuilderEngineDeps, request: ImportRequest, target: TargetCodes, ask = 'Uninstall it first, or install it there.'): Promise<string | undefined> {
    const read = (pack: DatapackId) => readInstallRecord(deps.files ?? nodeRecordFiles, deps.projectPath, pack);
    const record = (await read(request.id)) ?? (request.updates && (await read(request.updates))); // an update's (U1)
    if (!record) return undefined;
    const name = deps.nameOf?.(request.id) ?? request.id.name;
    // Its ids are another instance's: reused here they would be read and written on this one (step-07 D6).
    if (onAnotherInstance(record.instance, deps.instance)) return installedOnAnotherInstanceLine(request.id, name);
    const website = record.target?.websiteCode ?? settingsWebsite(record.created);
    const moved = website !== undefined && website !== target.websiteCode;
    const otherView = record.target !== undefined && record.target.storeCode !== target.storeCode;
    if (!moved && !otherView) return undefined;
    const where = moved
        ? `the website ${await nameInStore(deps, 'store/websites', website)}`
        : `the store view ${await nameInStore(deps, 'store/storeViews', record.target?.storeCode ?? '')}`;
    return `${name} is installed on ${where}. ${ask}`;
}
