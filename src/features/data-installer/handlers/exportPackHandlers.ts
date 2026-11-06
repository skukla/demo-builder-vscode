/**
 * Build a datapack file from a Commerce product export (owner, 2026-11-05).
 *
 * Reads the export (and a base pack, when named) from inside the open project and writes the new
 * pack there, like `save-datapack-zip`. Nothing reaches a store: loading it is `load-datapack-zip`,
 * installing it is Import. The pack is checked with the install's own row checks before it is
 * written, so a file that would be refused at install is never made (`packRowProblems`).
 *
 * Panel-free: it is reached by the `build_datapack_from_export` agent tool. No screen sends it.
 *
 * @module features/data-installer/handlers/exportPackHandlers
 */

import * as path from 'path';
import { DatapackTransferError } from '../services/datapackTransfer';
import { buildDatapackZip, datapackZipName, readDatapackZip } from '../services/datapackZip';
import { packRowProblems } from '../services/demoBuilderEngine/runPack';
import {
    buildPackFromExport,
    type ExportPackResult,
} from '../services/exportPack/buildPackFromExport';
import { CsvError } from '../services/exportPack/csvTable';
import { projectPath, readPackFile, writeZip } from './datapackFiles';
import { failure } from './datapackZipHandlers';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

export interface BuildFromExportPayload {
    /** The export file, inside the project: the CSV Commerce writes, or the same table as JSON. */
    exportPath?: string;
    /**
     * Where to write the pack, inside the project, as every file-writing tool names it; a path not
     * ending in .zip is a folder. Absent, the project's own folder.
     */
    path?: string;
    datapackName?: string;
    version?: string;
    displayName?: string;
    description?: string;
    /** A datapack file, inside the project, whose attributes and other kinds the new pack carries. */
    basePath?: string;
}

/** The store's rule for a pack name, checked here so a file is never made that no store would take. */
const PACK_NAME = /^[a-zA-Z0-9_-]+$/u;

const REQUIRED = ['exportPath', 'datapackName', 'version', 'displayName'] as const;

type Checked = Required<Pick<BuildFromExportPayload, (typeof REQUIRED)[number]>> &
    Pick<BuildFromExportPayload, 'path' | 'description' | 'basePath'>;

function checkPayload(payload: BuildFromExportPayload | undefined): Checked | { error: string } {
    const missing = REQUIRED.filter((key) => !payload?.[key]?.trim());
    if (missing.length > 0)
        return { error: `Name ${missing.join(', ')} to build a datapack from an export.` };
    const given = payload as Checked;
    if (!PACK_NAME.test(given.datapackName)) {
        return {
            error: `${given.datapackName} cannot be a datapack name: use letters, digits, - and _ only.`,
        };
    }
    return given;
}

/** The most of a list an answer carries, so its size never follows the export's (`responseSize`). */
const LIST_MAX = 50;

/** A list, cut at LIST_MAX, with its full count when it was cut; nothing when it is empty. */
function listed(key: string, items: readonly string[]): Record<string, unknown> {
    if (items.length === 0) return {};
    return { [key]: items.slice(0, LIST_MAX), ...(items.length > LIST_MAX ? { [`${key}Count`]: items.length } : {}) };
}

/** What the agent is told: where the file went, what it holds, and what it could not carry. */
function answerOf(target: string, bytes: number, result: ExportPackResult): Record<string, unknown> {
    return {
        path: target,
        bytes,
        dataTypes: result.pack.items.map((item) => item.dataType),
        products: result.products,
        giftCards: result.giftCards,
        categories: result.categories,
        ...listed('leftOutAttributes', result.leftOutAttributes),
        ...listed('unmatchedCategories', result.unmatchedCategories),
    };
}

async function build(context: HandlerContext, given: Checked): Promise<HandlerResponse> {
    const file = await projectPath(context, given.exportPath);
    const exportText = (await readPackFile(context, file)).toString('utf8');
    const base = given.basePath
        ? readDatapackZip(await readPackFile(context, await projectPath(context, given.basePath)))
        : undefined;
    const id = { name: given.datapackName, version: given.version };
    const result = buildPackFromExport({
        exportText,
        exportName: path.basename(file),
        id,
        displayName: given.displayName,
        ...(given.description ? { description: given.description } : {}),
        ...(base ? { base } : {}),
    });
    const rows = Object.fromEntries(result.pack.items.map((item) => [item.dataType, item.records]));
    const problems = packRowProblems(rows, undefined);
    if (problems.length > 0) {
        throw new DatapackTransferError(
            `The pack would be refused at install, so it was not written: ${problems.join(' ')}`,
        );
    }
    const target = await projectPath(context, given.path ?? '.', datapackZipName(id));
    const bytes = buildDatapackZip(result.pack);
    await writeZip(target, bytes);
    context.logger.info(
        `[Data Installer] Built ${id.name}@${id.version} from ${path.basename(file)} as ${target} (${result.products} products)`,
    );
    return { success: true, data: answerOf(target, bytes.length, result) };
}

export const exportPackHandlers = defineHandlers({
    'build-datapack-from-export': async (
        context: HandlerContext,
        payload?: BuildFromExportPayload,
    ): Promise<HandlerResponse> => {
        const given = checkPayload(payload);
        if ('error' in given) return { success: false, error: given.error };
        try {
            return await build(context, given);
        } catch (error) {
            // A file that is not a product export is the SC's to fix, so it gets its own words.
            const said =
                error instanceof CsvError ? new DatapackTransferError(error.message) : error;
            return failure(context, said, 'The datapack could not be built from that export.');
        }
    },
});
