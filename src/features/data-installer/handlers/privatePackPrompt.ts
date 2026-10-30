/**
 * Exporting a project whose pack is the SC's own PRIVATE library pack (owner, 2026-10-30).
 *
 * A project file carries its pack by reference, and a private pack is the owner's alone, so a
 * colleague who creates a project from the file cannot read it. Every export door asks: a person,
 * once, "Your teammates can't use this pack's data. Share it?", with Share (the share's own consent
 * sentence as the detail); declining exports anyway. An agent's export answers the same sentence as
 * a note, naming `share_datapack`. Whether the pack is private is read from the library
 * (`find-datapacks`: `mine`, `shared`); a library that cannot be asked asks nothing, so an export
 * is never held up by it.
 *
 * Doors: the projects list's Export (`projectsListTransfer.ts`), the dashboard's demo bundle with
 * its setup part (`exportDemoBundleHandler.ts`, which also backs `export_demo_bundle`), and
 * `export_project_settings` (`projectManagementHandlers.ts`).
 *
 * @module features/data-installer/handlers/privatePackPrompt
 */

import * as vscode from 'vscode';
import type { DataInstallerClient } from '../services/dataInstallerClient';
import { SHARE_CONSENT } from '../shareWording';
import { resolveDataInstallerAccess } from './dataInstallerHandlers';
import { datapackLibraryHandlers } from './datapackLibraryHandlers';
import type { ProjectDatapack } from '@/types/datapack';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** The owner's words (2026-10-30). */
export const PRIVATE_PACK_QUESTION = "Your teammates can't use this pack's data. Share it?";

/** The project's pack, when it is the SC's own and only they can read it. */
export interface PrivatePack {
    name: string;
    version: string;
    displayName: string;
}

/** What the question needs, handed in so a test drives it with no library and no modal. */
export interface PackSharingDeps {
    library: (context: HandlerContext) => Promise<Pick<DataInstallerClient, 'findDatapacks'> | undefined>;
    /** The question; true for Share. */
    ask: (question: string, detail: string) => Promise<boolean>;
    share: (context: HandlerContext, name: string) => Promise<HandlerResponse>;
}

/**
 * The project's pack when it is the SC's own private library pack, read from the library.
 *
 * @returns undefined for a Data Installer pack, a shared one, someone else's, or one not listed
 */
export async function privatePackOf(client: Pick<DataInstallerClient, 'findDatapacks'>, project: { datapack?: ProjectDatapack }): Promise<PrivatePack | undefined> {
    const pack = project.datapack;
    if (pack?.store !== 'library') return undefined;
    const rows = (await client.findDatapacks({ datapackName: pack.name })).items;
    const row = rows.find((r) => r.id.name === pack.name && r.id.version === pack.version);
    if (!row || row.mine !== true || row.shared) return undefined;
    return { name: pack.name, version: pack.version, displayName: row.displayName };
}

const SHARE = 'Share';

export const DEFAULT_PACK_SHARING_DEPS: PackSharingDeps = {
    library: async (context) => {
        const access = await resolveDataInstallerAccess(context, 'library');
        return access.ok ? access.client : undefined;
    },
    ask: async (question, detail) => {
        const share: vscode.MessageItem = { title: SHARE };
        const answer = await vscode.window.showInformationMessage(question, { modal: true, detail }, share, { title: 'Export Anyway', isCloseAffordance: true });
        return answer?.title === SHARE;
    },
    share: (context, name) => datapackLibraryHandlers['share-library-datapack'](context, { datapackName: name, shared: true, confirm: true }),
};

/** The private pack, or undefined when there is none or the library cannot say. Never rejects. */
async function findPrivatePack(context: HandlerContext, project: { datapack?: ProjectDatapack }, deps: PackSharingDeps): Promise<PrivatePack | undefined> {
    if (project.datapack?.store !== 'library') return undefined;
    try {
        const client = await deps.library(context);
        return client ? await privatePackOf(client, project) : undefined;
    } catch (error) {
        context.debugLogger.debug(`[Export] Could not read whether the pack is shared: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}

/**
 * Ask a person once, before an export, whether to share the project's private pack.
 *
 * @returns `shared`, `declined` (or the share was refused: the export goes on either way), or
 *   `none` when there was nothing to ask
 */
export async function offerToShareBeforeExport(
    context: HandlerContext,
    project: { datapack?: ProjectDatapack },
    deps: PackSharingDeps = DEFAULT_PACK_SHARING_DEPS,
): Promise<'shared' | 'declined' | 'none'> {
    const pack = await findPrivatePack(context, project, deps);
    if (!pack) return 'none';
    if (!(await deps.ask(PRIVATE_PACK_QUESTION, SHARE_CONSENT))) return 'declined';
    const shared = await deps.share(context, pack.name);
    if (shared.success) return 'shared';
    context.logger.warn(`[Export] ${pack.displayName} was not shared: ${shared.error ?? 'no reason given'}. The file is exported anyway.`);
    return 'declined';
}

/** The note an agent's export answers when the project's pack is private, or undefined. */
export async function privatePackNote(
    context: HandlerContext,
    project: { datapack?: ProjectDatapack },
    deps: PackSharingDeps = DEFAULT_PACK_SHARING_DEPS,
): Promise<string | undefined> {
    const pack = await findPrivatePack(context, project, deps);
    if (!pack) return undefined;
    return `${PRIVATE_PACK_QUESTION} The file names ${pack.displayName} (${pack.name}), which only you can read; share_datapack with shared:true shares it.`;
}
