/**
 * Block-tool MCP handlers — the storefront's block surface.
 *
 * `list_blocks`, `get_block_source` (index/detail split),
 * `get_block_authoring_shape` (registry index/detail), and the DA.live
 * library door: `promote_block_to_library` / `remove_block_from_library`.
 * The registry/sanitizer machinery lives in `blockAuthoring`; the
 * commit-push-publish tail in `blockLibraryPublish`.
 *
 * Split from `mcp-server.ts` (god-file decomposition, 2026-08-23); the
 * combined `toolHandlers` object there spreads this map back in.
 *
 * @module mcp/blockToolHandlers
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import {
    applyComponentDefinitionEntry,
    authoringConvention,
    DEFAULT_LIST_LIMIT,
    MAX_AUTHORING_INDEX_ROWS,
    MAX_BLOCK_FILES,
    MAX_FILE_BYTES,
    readComponentDefinition,
    readInstalledBlockLibraries,
    readPromoteBlockContext,
    removeComponentDefinitionEntry,
    resolveFilterChildren,
    resolveModelFields,
    sanitizeBlockHtml,
    verifyBlockSourceExists,
} from './blockAuthoring';
import {
    publishStorefrontAndDaLive,
    staticTokenProvider,
    unpublishStorefrontAndDaLive,
} from './blockLibraryPublish';
import type { McpToolCredentials } from './credentials';
import { assertInsideProject, resolveProjectPath, resolveStorefrontPath } from './projectSecurity';
import { paginate } from './projectToolHandlers';
import { DaLiveContentOperations } from '@/features/eds/services/daLiveContentOperations';

/** The block tool handlers (spread into `toolHandlers` in mcp-server). */
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
     * Progressive block-source reader.
     *
     * Without `fileName`, returns a lightweight manifest — `{ files: [{ name, bytes }] }`
     * — so an agent can pick exactly which file it needs instead of ingesting every
     * file in the block. With `fileName`, returns that single file's source
     * (`{ name, content }`), truncated if it exceeds {@link MAX_FILE_BYTES}.
     *
     * Returning one file per call keeps the aggregate response bounded by a single
     * file's cap, rather than the old behavior of dumping up to MAX_BLOCK_FILES ×
     * MAX_FILE_BYTES in one response.
     */
    async getBlockSource(
        projectsDir: string,
        projectName: string,
        blockName: string,
        fileName?: string,
    ): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const storefrontPath = await resolveStorefrontPath(projectPath);
        if (!path.isAbsolute(storefrontPath)) {
            throw new Error(`storefrontPath must be an absolute path: ${storefrontPath}`);
        }
        await assertInsideProject(projectPath, storefrontPath);
        const resolved = path.resolve(path.join(storefrontPath, 'blocks'), blockName);
        await assertInsideProject(path.join(storefrontPath, 'blocks'), resolved);
        const entries = await fsPromises.readdir(resolved, { withFileTypes: true });
        const files = entries.filter((e) => e.isFile());

        // No fileName → return a names + sizes manifest only (cheap; lets the agent
        // choose what to fetch). The size lets it skip files that would truncate.
        if (!fileName) {
            const manifest = await Promise.all(
                files.slice(0, MAX_BLOCK_FILES).map(async (f) => {
                    const { size } = await fsPromises.stat(path.join(resolved, f.name));
                    return { name: f.name, bytes: size };
                }),
            );
            return JSON.stringify({ files: manifest });
        }

        // fileName provided → read that single file. The fileName must name a real
        // entry in this block directory; matching against the listing (plus the
        // realpath check below) rules out traversal and symlink escapes.
        const match = files.find((f) => f.name === fileName);
        if (!match) {
            throw new Error(`File "${fileName}" not found in block "${blockName}"`);
        }
        const filePath = path.resolve(resolved, fileName);
        await assertInsideProject(resolved, filePath);
        const { size } = await fsPromises.stat(filePath);
        const content =
            size > MAX_FILE_BYTES
                ? `[truncated: ${size} bytes — file exceeds ${MAX_FILE_BYTES / 1000} KB; read it directly from disk if full contents are needed]`
                : await fsPromises.readFile(filePath, 'utf-8');
        return JSON.stringify({ name: fileName, content });
    },

    /**
     * Read a block's AUTHORING shape — how a DA.live author fills the block in,
     * as opposed to how its JS consumes what they filled in.
     *
     * The answer already sits in the storefront's three registry files and is
     * read back by nothing. Deriving it instead — reading a block's JS and
     * inferring the table it expects — measured ~121,000 tokens for eight blocks
     * during the Bodea build. This answers for one block in roughly two hundred.
     *
     * Three conventions coexist, and which one a block uses is itself the
     * answer. Counts are what {@link authoringConvention} REPORTS across 78 real
     * components, not raw key presence — 51 entries carry `rows`/`columns`, but
     * 15 of those also carry `fields` and are classified by it:
     *   - `rows`/`columns`         — a positional table (36 of 78)
     *   - `name`/`type`/`fields`   — key-value cells with CSS selectors (35)
     *   - `unsafeHTML`             — literal markup (4; what promotion writes)
     *   - nothing at all           — (3)
     *
     * `plugins.da` alone is not enough for nested blocks: `cards` reports two
     * columns, but its real content is `card` children, which only
     * `component-filters.json` knows. `component-models.json` names the fields.
     * Both are best-effort — 38 of 78 real components resolve no model fields
     * (27 name a model id that has no entry, 11 name none at all), and a
     * storefront may ship neither file.
     *
     * Omit `blockName` for the registry index (ids, titles, which convention);
     * pass it for the full shape. Mirrors `getBlockSource`'s index/detail split.
     */
    async getBlockAuthoringShape(
        projectsDir: string,
        projectName: string,
        blockName?: string,
        search?: string,
    ): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const storefrontPath = await resolveStorefrontPath(projectPath);
        await assertInsideProject(projectPath, storefrontPath);
        const { parsed } = await readComponentDefinition(storefrontPath);

        // The registry is groups[]-nested: a flat components[] scan sees only the
        // first group. Measured on a real storefront, 76 of 78 components live
        // outside group 0, so that mistake would hide almost everything.
        const entries = (parsed.groups ?? []).flatMap((g) => g.components ?? []);

        if (!blockName) {
            // Index: which blocks exist and which convention each uses. Deliberately
            // carries no markup, selectors or field lists — that is the whole point
            // of splitting it from the detail call.
            //
            // `search` and a page size because the index alone was still
            // unbounded: 78 blocks is 5,577 bytes, but a 300-component registry
            // measured 21,992. Splitting index from detail bounds the DETAIL
            // call; it does nothing for a catalog that keeps growing.
            const all = entries.map((e) => ({
                id: e.id,
                title: e.title,
                authoring: authoringConvention(e),
            }));
            const term = search?.trim().toLowerCase();
            const matched = term
                ? all.filter(
                      (b) =>
                          b.id.toLowerCase().includes(term) ||
                          (b.title ?? '').toLowerCase().includes(term),
                  )
                : all;
            const page = matched.slice(0, MAX_AUTHORING_INDEX_ROWS);
            return JSON.stringify({
                blocks: page,
                count: page.length,
                total: matched.length,
                ...(term ? { search: term, totalUnfiltered: all.length } : {}),
                ...(matched.length > page.length
                    ? { more: `${matched.length - page.length} more — narrow with search` }
                    : {}),
            });
        }

        const entry = entries.find((e) => e.id === blockName);
        if (!entry) {
            // A block can exist under blocks/ and never have been registered. That
            // is a different problem from a typo, so name the tool that tells the
            // two apart rather than reporting a flat "not found".
            throw new Error(
                `Block "${blockName}" is not registered in the authoring library. ` +
                    `Call get_block_authoring_shape with no blockName for the registered ids, ` +
                    `or get_block_source to check whether the block exists on disk unregistered.`,
            );
        }
        const authoring = entry.plugins?.da;
        if (!authoring || Object.keys(authoring).length === 0) {
            throw new Error(
                `Block "${blockName}" is registered but declares no authoring shape ` +
                    `(no plugins.da). Read its source with get_block_source instead.`,
            );
        }

        const [fields, childComponents] = await Promise.all([
            resolveModelFields(storefrontPath, entry.model),
            resolveFilterChildren(storefrontPath, entry.filter),
        ]);

        return JSON.stringify({
            id: entry.id,
            title: entry.title,
            ...(entry.description ? { description: entry.description } : {}),
            authoring,
            ...(childComponents ? { childComponents } : {}),
            ...(fields ? { fields } : {}),
        });
    },

    /**
     * Promote a local block to the DA.live authoring library.
     *
     * Adds the block to `component-definition.json`, writes the doc page in
     * `.da/library/blocks/<blockId>`, appends a row to `.da/library/blocks.json`,
     * commits/pushes the storefront, and previews/publishes the doc page.
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
        description?: string,
        tokens?: McpToolCredentials,
    ): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const ctx = await readPromoteBlockContext(projectPath);

        // Validate the storefront path is absolute and lives inside the project.
        if (!path.isAbsolute(ctx.storefrontPath)) {
            throw new Error(`storefrontPath must be an absolute path: ${ctx.storefrontPath}`);
        }
        await assertInsideProject(projectPath, ctx.storefrontPath);

        await verifyBlockSourceExists(ctx.storefrontPath, blockId);

        // Defense-in-depth: sanitize AI-supplied HTML before it lands in two
        // persistent stores (component-definition.json + published doc page).
        // See sanitizeBlockHtml() for the allowlist rationale.
        const safeHtml = sanitizeBlockHtml(unsafeHTML);

        const componentDefinition = await applyComponentDefinitionEntry(
            ctx.storefrontPath,
            blockId,
            title,
            safeHtml,
            description,
        );

        // Credentials come from the live extension session (DaLiveAuthService /
        // GitHubTokenService), injected by registerProjectTools.
        const daLiveToken = tokens?.daLiveToken;
        if (!daLiveToken) {
            throw new Error(
                'DA.live token unavailable — sign in to DA.live first ' +
                    '(check get_auth_status, then the sign_in tool with provider:"dalive").',
            );
        }
        const githubToken = tokens?.githubToken ?? undefined;

        // Logger is unused for the MCP stdio flow — supply a no-op shim. The
        // DA.live operations log to stderr in the real flow; the MCP wrapper
        // intentionally suppresses noise.
        const noopLogger = {
            trace: () => undefined,
            debug: () => undefined,
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
        };
        const daLiveOps = new DaLiveContentOperations(staticTokenProvider(daLiveToken), noopLogger);

        // Doc page: upsertBlockDocPage always writes so AI iteration on
        // unsafeHTML refreshes the rendered preview. (ensureBlockDocPages is
        // deliberately non-destructive for the template path — wrong contract
        // for this flow.)
        const docPage = await daLiveOps.upsertBlockDocPage(ctx.daLiveOrg, ctx.daLiveSite, {
            id: blockId,
            exampleHtml: safeHtml,
        });

        const sheetResult = await daLiveOps.appendBlockToLibrary(ctx.daLiveOrg, ctx.daLiveSite, {
            blockId,
            title,
        });

        const publish = await publishStorefrontAndDaLive(ctx, blockId, githubToken, daLiveToken);

        return JSON.stringify({
            docPage,
            sheet: sheetResult.status,
            componentDefinition,
            publish,
            details: `Block "${title}" (${blockId}) promoted to ${ctx.daLiveOrg}/${ctx.daLiveSite}`,
        });
    },

    /**
     * Remove a block from the DA.live authoring library — inverse of
     * {@link promoteBlockToLibrary}.
     *
     * Reverses the library registration: removes the entry from
     * `component-definition.json`, deletes the DA.live doc page, drops the
     * sheet row, commits/pushes the storefront removal, and unpublishes the
     * doc page. Does NOT delete the block's source files in `blocks/<blockId>/`
     * — that is the agent's job (see the remove-custom-block skill).
     *
     * Partial-success: the storefront push / unpublish failures do NOT throw —
     * the returned status fields surface the real state of each step. Validation
     * and missing-DA.live-token failures DO throw (per the MCP error envelope).
     */
    async removeBlockFromLibrary(
        projectsDir: string,
        projectName: string,
        blockId: string,
        tokens?: McpToolCredentials,
    ): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const ctx = await readPromoteBlockContext(projectPath);

        if (!path.isAbsolute(ctx.storefrontPath)) {
            throw new Error(`storefrontPath must be an absolute path: ${ctx.storefrontPath}`);
        }
        await assertInsideProject(projectPath, ctx.storefrontPath);

        const daLiveToken = tokens?.daLiveToken;
        if (!daLiveToken) {
            throw new Error(
                'DA.live token unavailable — sign in to DA.live first ' +
                    '(check get_auth_status, then the sign_in tool with provider:"dalive").',
            );
        }
        const githubToken = tokens?.githubToken ?? undefined;

        const componentDefinition = await removeComponentDefinitionEntry(
            ctx.storefrontPath,
            blockId,
        );

        const noopLogger = {
            trace: () => undefined,
            debug: () => undefined,
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
        };
        const daLiveOps = new DaLiveContentOperations(staticTokenProvider(daLiveToken), noopLogger);
        const { docPage, sheet } = await daLiveOps.removeBlockFromLibrary(
            ctx.daLiveOrg,
            ctx.daLiveSite,
            { blockId },
        );

        const unpublish = await unpublishStorefrontAndDaLive(
            ctx,
            blockId,
            githubToken,
            daLiveToken,
        );

        return JSON.stringify({
            componentDefinition,
            docPage,
            sheet,
            unpublish,
            details: `Block "${blockId}" removed from ${ctx.daLiveOrg}/${ctx.daLiveSite} library`,
        });
    },
};
