/**
 * Block-tool MCP handlers — the storefront's block surface.
 *
 * `list_blocks`, `get_block_authoring_shape` (index/detail, `blockAuthoringShape`),
 * and the DA.live block list door: `promote_block_to_library` (a block's example
 * and title) / `remove_block_from_library` (the block's code, then its page and
 * row). The block list follows the storefront's code (EDS-71 step 5, owner
 * 2026-11-23: one rule, no hide list); `component-definition.json` is not read
 * or written. The sanitizer and manifest reads live in `blockAuthoring`, the code
 * deletion in `blockRemoval`, the commit-push-publish tail in `blockLibraryPublish`.
 *
 * Split from `mcp-server.ts` (god-file decomposition, 2026-08-23); the
 * combined `toolHandlers` object there spreads this map back in.
 *
 * @module mcp/blockToolHandlers
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import {
    DEFAULT_LIST_LIMIT,
    readInstalledBlockLibraries,
    readManifest,
    readPromoteBlockContext,
    sanitizeBlockHtml,
    verifyBlockSourceExists,
    type PromoteBlockContext,
} from './blockAuthoring';
import {
    blockAuthoringDetail,
    blockAuthoringIndex,
    type ExamplePageSource,
} from './blockAuthoringShape';
import {
    daLiveOpsFor,
    publishStorefrontAndDaLive,
    unpublishStorefrontAndDaLive,
} from './blockLibraryPublish';
import { assertBlockName, deleteBlockCode } from './blockRemoval';
import { DEFAULT_NEEDS_EXAMPLE_LIMIT, listBlocksNeedingExamples } from './blocksNeedingExamples';
import type { McpToolCredentials, ProjectFileHooks } from './credentials';
import { assertInsideProject, resolveProjectPath, resolveStorefrontPath } from './projectSecurity';
import { paginate, projectToolHandlers } from './projectToolHandlers';
import { withLibraryDescription } from '@/features/eds/services/blockLibrary/exampleDescription';
import {
    dropBlockNeedingExample,
    readBlocksNeedingExamples,
} from '@/features/eds/services/blockLibrary/examplesNeededRecord';

/**
 * The answer a block tool gives when DA.live is not signed in.
 *
 * A missing credential is the caller's NORMAL state, not an exceptional one — an
 * agent reaches these tools before signing in all the time. Both tools used to
 * throw here, which is the one thing the "tools do not error on a missing
 * credential" rule asks them not to do: an MCP error is not a result the caller
 * can branch on, and the recovery is buried in prose.
 *
 * The shape matches the confirm refusals a few lines away in `mcp-server.ts` —
 * JSON with an `error` — plus the `needsAuth` marker every other credential-
 * guarded tool now returns, so one field answers "which sign-in?" for all of them.
 */
function missingDaLiveToken(toolName: string): string {
    return JSON.stringify({
        error:
            `${toolName} needs DA.live sign-in. Check get_auth_status, then ` +
            'sign_in(provider:"dalive", confirm:true) once the user agrees.',
        needsAuth: 'dalive',
    });
}

/** The project's storefront context, its checkout checked to be inside the project. */
async function storefrontContext(
    projectsDir: string,
    projectName: string,
): Promise<PromoteBlockContext> {
    const projectPath = resolveProjectPath(projectsDir, projectName);
    const ctx = await readPromoteBlockContext(projectPath);
    if (!path.isAbsolute(ctx.storefrontPath)) {
        throw new Error(`storefrontPath must be an absolute path: ${ctx.storefrontPath}`);
    }
    await assertInsideProject(projectPath, ctx.storefrontPath);
    return ctx;
}

/** Where the block's example page is read from: the storefront's DA.live site. */
async function examplePageSource(
    projectPath: string,
    daLiveToken: string | null | undefined,
): Promise<ExamplePageSource> {
    if (!daLiveToken) return { unavailable: 'not-signed-in' };
    let ctx: PromoteBlockContext;
    try {
        ctx = await readPromoteBlockContext(projectPath);
    } catch {
        return { unavailable: 'no-da-live-site' };
    }
    const ops = daLiveOpsFor(daLiveToken).blockLibOps;
    return { read: (blockId) => ops.readBlockDocPage(ctx.daLiveOrg, ctx.daLiveSite, blockId) };
}

/**
 * Deletes the block's code after DA.live has already changed, so a failure is reported, not
 * thrown: the code staying is self-healing, as the next Refresh Blocks lists the block again.
 */
async function deleteCodeReported(
    storefrontPath: string,
    blockId: string,
): Promise<{ status: 'deleted' | 'absent' | 'failed'; note?: string }> {
    try {
        return { status: await deleteBlockCode(storefrontPath, blockId) };
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
            status: 'failed',
            note: `The block's page and row were removed, but its code folder could not be `
                + `deleted (${reason}). The code is still there, so the next Refresh Blocks `
                + 'lists it again; delete blocks/' + blockId + '/ and push to finish.',
        };
    }
}

/**
 * Take a block off the project's "needs an example" record once it has one (EDS-71 step 4c),
 * writing the manifest only when the record changed, through the MCP manifest door
 * (`update_project_config`'s handler: atomic, refuses malformed JSON). A failure is reported,
 * never thrown: the example is already in DA.live.
 *
 * Used by promote (the block has an example now) and remove (the block has no code left to give
 * one to). A written record is announced through `hooks.written` so an open dashboard re-reads
 * the count; a failure goes to `hooks.warn` and comes back as a sentence for the SC.
 *
 * @returns the fields the tool's answer carries: none when the block was not on the record
 */
async function takeOffExamplesRecord(
    projectsDir: string,
    projectName: string,
    blockId: string,
    hooks: ProjectFileHooks | undefined,
): Promise<{ examplesRecord?: 'recorded' | 'failed'; examplesRecordNote?: string }> {
    try {
        const manifest = await readManifest(resolveProjectPath(projectsDir, projectName));
        if (!dropBlockNeedingExample(manifest, blockId)) return {};
        await projectToolHandlers.updateProjectConfig(
            projectsDir, projectName, '.demo-builder.json', JSON.stringify(manifest, null, 2),
        );
        hooks?.written?.();
        return { examplesRecord: 'recorded' };
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        hooks?.warn?.(`[BlockTools] Draft Examples record not updated for ${blockId}: ${reason}`);
        return { examplesRecord: 'failed', examplesRecordNote: RECORD_NOT_UPDATED };
    }
}

/** What `examplesRecord: 'failed'` means for the SC. */
const RECORD_NOT_UPDATED = 'DA.live has the change, but the project file could not be updated, '
    + "so the dashboard's Draft Examples count may be one off until the next Refresh Blocks.";

export const blockToolHandlers = {
    async listBlocks(
        projectsDir: string,
        projectName: string,
        offset?: number,
        // See listProjects: the cap belongs in the handler, not only the schema.
        limit: number = DEFAULT_LIST_LIMIT,
    ): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const storefrontPath = await resolveStorefrontPath(projectPath);
        if (!path.isAbsolute(storefrontPath)) {
            throw new Error(`storefrontPath must be an absolute path: ${storefrontPath}`);
        }
        await assertInsideProject(projectPath, storefrontPath);
        const blocksDir = path.join(storefrontPath, 'blocks');
        let dirNames: string[];
        try {
            const entries = await fsPromises.readdir(blocksDir, { withFileTypes: true });
            dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
        } catch {
            return JSON.stringify([]);
        }

        // Cross-reference each block against installedBlockLibraries so AI agents
        // know which library a block came from (informs promotion target choice).
        // First matching library wins on collisions — install order is the
        // canonical source-of-truth for which library a block currently mirrors.
        const libs = await readInstalledBlockLibraries(projectPath);
        const result = dirNames.map((name) => {
            const lib = libs.find((l) => Array.isArray(l.blockIds) && l.blockIds.includes(name));
            if (!lib) return { name };
            return {
                name,
                originLibrary: { name: lib.name, owner: lib.source.owner, repo: lib.source.repo },
            };
        });
        return JSON.stringify(paginate(result, offset, limit));
    },

    /**
     * Read a block's AUTHORING shape — how a DA.live author fills the block in,
     * as opposed to how its JS consumes what they filled in. Deriving it by
     * reading a block's JS measured ~121,000 tokens for eight blocks during the
     * Bodea build; this answers for one block in a few hundred.
     *
     * Omit `blockName` for the index (the storefront's block folders); pass it
     * for one block's shape (`blockAuthoringShape`). The example page is read
     * with the DA.live token when there is one; without it the block's code
     * answers, and `examplePage` says why.
     */
    async getBlockAuthoringShape(
        projectsDir: string,
        projectName: string,
        blockName?: string,
        search?: string,
        tokens?: McpToolCredentials,
    ): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const storefrontPath = await resolveStorefrontPath(projectPath);
        await assertInsideProject(projectPath, storefrontPath);
        if (!blockName) {
            return JSON.stringify(await blockAuthoringIndex(storefrontPath, search));
        }
        assertBlockName(blockName);
        try {
            await verifyBlockSourceExists(storefrontPath, blockName);
        } catch {
            throw new Error(
                `Block "${blockName}" has no folder under blocks/ in the storefront checkout. ` +
                    'Call get_block_authoring_shape with no blockName for the blocks it has.',
            );
        }
        const pageSource = await examplePageSource(projectPath, tokens?.daLiveToken);
        return JSON.stringify(await blockAuthoringDetail(storefrontPath, blockName, pageSource));
    },

    /**
     * The blocks with no example an author can use in DA.live (`blocksNeedingExamples`):
     * read from the storefront's DA.live pages when signed in, else the list the last block
     * list build recorded on the project. Read-only.
     */
    async listBlocksNeedingExamples(
        projectsDir: string,
        projectName: string,
        offset?: number,
        limit: number = DEFAULT_NEEDS_EXAMPLE_LIMIT,
        tokens?: McpToolCredentials,
    ): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const storefrontPath = await resolveStorefrontPath(projectPath);
        await assertInsideProject(projectPath, storefrontPath);
        const recorded = readBlocksNeedingExamples(await readManifest(projectPath));
        const pages = await examplePageSource(projectPath, tokens?.daLiveToken);
        return JSON.stringify(
            await listBlocksNeedingExamples(storefrontPath, recorded, pages, offset, limit),
        );
    },

    /**
     * Give a block in the storefront's code its example and title in the
     * storefront's DA.live block list.
     *
     * Writes the doc page in `.da/library/blocks/<blockId>` (always, so iterating
     * refreshes the preview), adds or renames the block's row in
     * `.da/library/blocks.json`, commits/pushes the storefront, and
     * previews/publishes the doc page. The page may hold several named examples
     * (a heading over each block table); `description` is written after each as a
     * `library-metadata` table (`exampleDescription.ts`). Once the page is written,
     * the block comes off the project's "needs an example" record (EDS-71 step 4c).
     *
     * Partial-success: a publish failure does NOT throw — the returned status
     * fields surface the real state of each step. Validation and "block source
     * not found" failures DO throw (per the MCP error envelope contract).
     */
    async promoteBlockToLibrary(
        projectsDir: string,
        projectName: string,
        blockId: string,
        title: string,
        unsafeHTML: string,
        tokens?: McpToolCredentials,
        description?: string,
        hooks?: ProjectFileHooks,
    ): Promise<string> {
        assertBlockName(blockId);
        const ctx = await storefrontContext(projectsDir, projectName);
        await verifyBlockSourceExists(ctx.storefrontPath, blockId);

        // Checked before any write, and answered rather than thrown — see
        // missingDaLiveToken(). Until 2026-09-01 it sat below a local write.
        const daLiveToken = tokens?.daLiveToken;
        if (!daLiveToken) {
            return missingDaLiveToken('promote_block_to_library');
        }
        const githubToken = tokens?.githubToken ?? undefined;

        // Defense-in-depth: sanitize AI-supplied HTML before it lands on the
        // published doc page. See sanitizeBlockHtml() for the allowlist rationale.
        // The description is added after sanitising, as text (escaped), never as markup.
        const safeHtml = withLibraryDescription(sanitizeBlockHtml(unsafeHTML), description);
        const ops = daLiveOpsFor(daLiveToken).blockLibOps;
        const { daLiveOrg, daLiveSite } = ctx;

        // Always writes, so AI iteration on unsafeHTML refreshes the preview. (The
        // library build keeps a page the storefront already has, and never takes
        // this one for a page it generated.)
        const docPage = await ops.upsertBlockDocPage(daLiveOrg, daLiveSite, {
            id: blockId,
            exampleHtml: safeHtml,
        });
        const sheet = await ops.appendBlockToLibrary(daLiveOrg, daLiveSite, { blockId, title });
        const publish = await publishStorefrontAndDaLive(ctx, blockId, githubToken, daLiveToken);
        // The block has an example now: the Draft Examples count drops by one.
        const record = docPage === 'written'
            ? await takeOffExamplesRecord(projectsDir, projectName, blockId, hooks)
            : {};

        return JSON.stringify({
            docPage,
            sheet: sheet.status,
            publish,
            ...record,
            details: `Block "${title}" (${blockId}) promoted to ${daLiveOrg}/${daLiveSite}`,
        });
    },

    /**
     * Remove a block from the storefront: its place in the DA.live block list,
     * then its code. The block list follows the code, so this is the one way to
     * take a block out of it; restoring the code (and Refresh Blocks) undoes it.
     *
     * Deletes the DA.live doc page and sheet row first, so a DA.live failure (an
     * expired sign-in, a sheet that cannot be read or rewritten) throws before
     * the code is touched; the example page may already be gone by then, and
     * the next Refresh Blocks writes it again from the code. Then deletes `blocks/<blockId>/` in the storefront
     * checkout (`'absent'` when already gone), commits/pushes the deletion, and
     * unpublishes the doc page.
     *
     * Partial-success: once DA.live has changed, nothing throws — a code folder
     * that cannot be deleted (`codeFolder: 'failed'`, with a `note`) and push /
     * unpublish failures are reported in the returned status fields. An invalid
     * block name throws before anything is changed.
     */
    async removeBlockFromLibrary(
        projectsDir: string,
        projectName: string,
        blockId: string,
        tokens?: McpToolCredentials,
        hooks?: ProjectFileHooks,
    ): Promise<string> {
        assertBlockName(blockId);
        const ctx = await storefrontContext(projectsDir, projectName);

        const daLiveToken = tokens?.daLiveToken;
        if (!daLiveToken) {
            return missingDaLiveToken('remove_block_from_library');
        }
        const githubToken = tokens?.githubToken ?? undefined;

        const { daLiveOrg, daLiveSite } = ctx;
        const ops = daLiveOpsFor(daLiveToken).blockLibOps;
        const removed = await ops.removeBlockFromLibrary(daLiveOrg, daLiveSite, { blockId });
        const code = await deleteCodeReported(ctx.storefrontPath, blockId);
        const unpublish = await unpublishStorefrontAndDaLive(
            ctx,
            blockId,
            githubToken,
            daLiveToken,
        );
        // A removed block has no code left to give an example to: off the Draft Examples count.
        const record = await takeOffExamplesRecord(projectsDir, projectName, blockId, hooks);

        return JSON.stringify({
            codeFolder: code.status,
            docPage: removed.docPage,
            sheet: removed.sheet,
            unpublish,
            ...(code.note ? { note: code.note } : {}),
            ...record,
            details: `Block "${blockId}" removed from the storefront and `
                + `${daLiveOrg}/${daLiveSite}`,
        });
    },
};
