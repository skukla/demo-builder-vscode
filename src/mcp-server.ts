/**
 * Demo Builder MCP — shared project-tool registration.
 *
 * Registers the project-scoped MCP tools — the ones that need only the
 * filesystem, not the extension host — via `registerProjectTools(server,
 * projectsDir)`. The authoritative list is the `server.registerTool(...)`
 * calls in that function and the name-by-name pin in
 * `tests/features/ai/server/inExtensionMcpServer.test.ts`; an enumeration here
 * only rots (it said "seven" while the function registered ten).
 *
 * The implementations live in `src/mcp/` (god-file decomposition, 2026-08-23 —
 * this file was 1794 lines):
 *
 * ├── mcp/projectSecurity        — path/name guards, the .env allowlist,
 * │                                config-path allowlist, storefront lookup
 * ├── mcp/projectToolHandlers    — list/get project, config read/write
 * ├── mcp/storefrontSyncHandler  — sync_storefront (+ rebase-and-retry)
 * ├── mcp/blockAuthoring         — manifest reads + HTML sanitizer
 * ├── mcp/blockAuthoringShape    — get_block_authoring_shape's index and detail
 * ├── mcp/blockRemoval           — deleting a block's code folder
 * ├── mcp/blockLibraryPublish    — the promote/remove publish tails
 * ├── mcp/blockToolHandlers      — the five block tools
 * └── mcp/credentials            — the credential provider types
 *
 * This module is NOT a server process. The in-extension MCP server
 * (`@/features/ai/server/inExtensionMcpServer`) imports `registerProjectTools`
 * and registers these tools alongside the handler-backed tools — see
 * `docs/systems/mcp-server.md` for the full architecture. The former standalone
 * `dist/mcp-server.js` stdio process was retired once the in-extension server
 * (reachable via the `dist/mcp-proxy.js` stdio→socket bridge) became the only
 * path; clients now always reach the extension host, so tools can reuse its
 * handlers and services directly.
 *
 * IMPORTANT: This file MUST NOT import 'vscode'. It is bundled into the
 * vscode-free `dist/mcp-proxy.js` path indirectly and consumed by the
 * extension host, but its tool handlers operate purely on the filesystem.
 */

import { z } from 'zod';
import { DEFAULT_LIST_LIMIT } from './mcp/blockAuthoring';
import { blockToolHandlers } from './mcp/blockToolHandlers';
import type { McpCredentialProvider, McpToolCredentials } from './mcp/credentials';
import { projectToolHandlers } from './mcp/projectToolHandlers';
import { storefrontSyncHandler } from './mcp/storefrontSyncHandler';
import { asRawText, asText } from '@/features/ai/server/mcpToolResult';
import type { McpToolServer } from '@/features/ai/server/mcpToolServer';
import { BLOCK_NAME_PATTERN as BLOCK_NAME } from '@/features/eds/services/blockLibrary/blockTable';

// Re-exported so the public identity of this module is unchanged by the split.
export type { McpCredentialProvider, McpToolCredentials } from './mcp/credentials';
export { resolveProjectPath, validateEnvContent } from './mcp/projectSecurity';

// ─── Tool handlers (exported for unit tests) ─────────────────────────────────

/** @internal — exported only for unit tests; not part of the public API */
export const toolHandlers = {
    ...projectToolHandlers,
    ...storefrontSyncHandler,
    ...blockToolHandlers,
};

// ─── Tool registration (shared) ──────────────────────────────────────────────

/**
 * Register the nine project tools on an MCP server instance. Consumed by the
 * in-extension server (`@/features/ai/server/inExtensionMcpServer`) — the only
 * live path now that the standalone `dist/mcp-server.js` stdio process is
 * retired (see this file's header).
 *
 * `server` is typed `any` to avoid TS2589 (deep type instantiation with inline
 * Zod schema inference) — a confirmed SDK regression (issue #1180, v1.23.0+).
 * The MCP SDK validates all inputs at runtime via the Zod schemas, so the cast
 * is safe.
 *
 * @param server      An `McpServer` instance (typed `any`; see above).
 * @param projectsDir Absolute path to the projects root (`~/.demo-builder/projects`).
 * @param credentials Optional resolver for DA.live / GitHub tokens, injected by
 *   the in-extension server so the credential-needing tools use the live sign-in
 *   session rather than env vars. Omitted in vscode-free/file-only contexts.
 *
 *   There are THREE, not the two this line used to name: `sync_storefront`,
 *   `promote_block_to_library` and `remove_block_from_library`. The third was
 *   missing until the 2026-08-31 tool-auth review read every tool for whether it
 *   calls `resolveCredentials`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function registerProjectTools(
    server: McpToolServer,
    projectsDir: string,
    credentials?: McpCredentialProvider,
): void {
    // Resolve credentials fresh per call (token expiry); undefined when no
    // provider, so the handlers fall back to their env-var path.
    const resolveCredentials = async (): Promise<McpToolCredentials | undefined> => {
        if (!credentials) {
            return undefined;
        }
        const [daLiveToken, githubToken] = await Promise.all([
            credentials.getDaLiveToken(),
            credentials.getGitHubToken(),
        ]);
        return { daLiveToken, githubToken };
    };

    const projectNameSchema = z
        .string()
        .describe('Project name (directory name under ~/.demo-builder/projects/)');
    const offsetSchema = z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Number of items to skip (pagination)');
    // `paginate` returns EVERYTHING when no limit is given, so an agent's first
    // call — always `{}` — got the whole list. Invisible on a developer's
    // machine (2 projects, 227 bytes) and not on a real one: 300 projects
    // measured 18,191 bytes, and a 300-component authoring index 21,992.
    //
    const limitSchema = z
        .number()
        .int()
        .min(0)
        .default(DEFAULT_LIST_LIMIT)
        .describe(`Maximum number of items to return (default ${DEFAULT_LIST_LIMIT})`);

    server.registerTool(
        'list_projects',
        {
            needsAuth: false,
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'List Projects',
            description:
                'List all Demo Builder projects: name, path, and pinned when set. To learn which project ' +
                'your tools act on, use get_current_project.',
            inputSchema: { offset: offsetSchema, limit: limitSchema },
        },
        async (args: any) =>
            asRawText(await toolHandlers.listProjects(projectsDir, args.offset, args.limit)),
    );

    server.registerTool(
        'get_project',
        {
            needsAuth: false,
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'Get Project',
            description:
                'Read Demo Builder project state. Returns a summary by default (large arrays collapsed); pass full=true for the complete .demo-builder.json',
            inputSchema: {
                projectName: projectNameSchema,
                full: z
                    .boolean()
                    .optional()
                    .describe('Return the complete manifest instead of the summary'),
            },
        },
        async (args: any) =>
            asRawText(await toolHandlers.getProject(projectsDir, args.projectName, args.full === true)),
    );

    server.registerTool(
        'get_component_config',
        {
            needsAuth: false,
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'Get Component Config',
            description:
                'Read .demo-builder.json or a .env file within the project directory. Secret values are masked — prefer this over reading .env directly so credentials never enter the transcript.',
            inputSchema: {
                projectName: projectNameSchema,
                configRelPath: z.string().describe('Relative path to config file within project'),
            },
        },
        async (args: any) =>
            asRawText(
                await toolHandlers.getComponentConfig(
                    projectsDir,
                    args.projectName,
                    args.configRelPath as string,
                ),
            ),
    );

    server.registerTool(
        'update_project_config',
        {
            needsAuth: false,
            annotations: { readOnlyHint: false, destructiveHint: false },
            title: 'Update Project Config',
            description:
                'Low-level whole-file write to .demo-builder.json or a .env file inside the project directory (path must not escape the project root). To SET a config value, use configure_project instead — it validates, routes secrets correctly, and marks dependent components stale; this raw write does none of that.',
            inputSchema: {
                projectName: projectNameSchema,
                configRelPath: z
                    .string()
                    .describe('Relative path (.demo-builder.json or path to .env file)'),
                content: z.string().max(1_000_000).describe('New file content'),
            },
        },
        async (args: any) =>
            asRawText(
                await toolHandlers.updateProjectConfig(
                    projectsDir,
                    args.projectName,
                    args.configRelPath as string,
                    args.content as string,
                ),
            ),
    );

    server.registerTool(
        'sync_storefront',
        {
            needsAuth: ['github'],
            annotations: { readOnlyHint: false, destructiveHint: false },
            title: 'Sync Storefront',
            description: 'Git add, commit, and push changes in the storefront directory',
            inputSchema: {
                projectName: projectNameSchema,
                commitMessage: z.string().max(500).describe('Git commit message'),
            },
        },
        async (args: any) =>
            asRawText(
                await toolHandlers.syncStorefront(
                    projectsDir,
                    args.projectName,
                    args.commitMessage as string,
                    await resolveCredentials(),
                ),
            ),
    );

    server.registerTool(
        'list_blocks',
        {
            needsAuth: false,
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'List Blocks',
            description: 'List all block directories in the storefront blocks/ directory',
            inputSchema: {
                projectName: projectNameSchema,
                offset: offsetSchema,
                limit: limitSchema,
            },
        },
        async (args: any) =>
            asRawText(
                await toolHandlers.listBlocks(
                    projectsDir,
                    args.projectName,
                    args.offset,
                    args.limit,
                ),
            ),
    );

    server.registerTool(
        'get_block_authoring_shape',
        {
            needsAuth: false,
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'Get Block Authoring Shape',
            description:
                "Get how an author fills in a block in DA.live — the table's rows, columns and style variants. With blockName: the tables on the block's example page in this site's DA.live block list, or, when it has no real example, the shape its code reads, plus its README. Omit blockName to list the storefront's code blocks, as the block list takes them (block folders named in lowercase words joined by hyphens); metadata and section-metadata are in the block list with no code, so they are not listed. Use this instead of reading a block's JS to infer its shape.",
            inputSchema: {
                projectName: projectNameSchema,
                blockName: z
                    .string()
                    .regex(BLOCK_NAME)
                    .optional()
                    .describe("The block's folder name under blocks/; omit to list the blocks"),
                search: z
                    .string()
                    .optional()
                    .describe('Filter the index by id or title (ignored when blockName is given)'),
            },
        },
        async (args: any) =>
            asRawText(
                await toolHandlers.getBlockAuthoringShape(
                    projectsDir,
                    args.projectName,
                    args.blockName as string | undefined,
                    args.search as string | undefined,
                    // The example page is read only for one block; the index is local.
                    args.blockName ? await resolveCredentials() : undefined,
                ),
            ),
    );

    server.registerTool(
        'promote_block_to_library',
        {
            needsAuth: ['dalive'],
            annotations: { readOnlyHint: false, destructiveHint: false },
            title: 'Promote Block to Library',
            // Phrasing matches sync-changes.md ("this site's own DA.live block
            // library"); mcpServer-promoteBlock.test.ts pins it. It said "push back to
            // source library" until 2026-10-13, which read as saving the block for
            // reuse across demos; it never did.
            description:
                "Give a block in blocks/ its example and title in this site's own DA.live block library (the Insert Block list authors use): writes the block's example page, adds or renames its row, and commits/pushes/publishes the storefront. Every block in the code is listed after Refresh Blocks; this sets what authors see for it. It does not save the block for other projects, and a reset removes it with the rest of the code. Requires confirm:true.",
            inputSchema: {
                projectName: projectNameSchema,
                blockId: z
                    .string()
                    .regex(BLOCK_NAME)
                    .describe(
                        "The block's folder name under blocks/: lowercase words joined by hyphens",
                    ),
                title: z
                    .string()
                    .min(1)
                    .max(200)
                    .describe('Human-readable block title shown in the DA.live library'),
                unsafeHTML: z
                    .string()
                    .max(100_000)
                    .describe("Example HTML for the block, written as the block's example page"),
                confirm: z
                    .boolean()
                    .optional()
                    .describe('Must be true — this pushes a commit and publishes to the live site'),
            },
        },
        async (args: any) => {
            // Gated for the same reason its inverse is: this commits, pushes and
            // publishes to a live site. Blast radius does not depend on the direction
            // of the change, so `remove_block_from_library` being gated while this one
            // was not was an inconsistency, not a policy.
            if (args?.confirm !== true) {
                // JSON, not prose — these two refusals predate the descriptor
                // registrar's prose one and an agent may already key on `error`.
                return asText({
                    error: 'promote_block_to_library pushes a commit and publishes the block to the live site. Call again with confirm:true.',
                    destructive: true,
                });
            }
            return asRawText(
                await toolHandlers.promoteBlockToLibrary(
                    projectsDir,
                    args.projectName,
                    args.blockId as string,
                    args.title as string,
                    args.unsafeHTML as string,
                    await resolveCredentials(),
                ),
            );
        },
    );

    server.registerTool(
        'remove_block_from_library',
        {
            needsAuth: ['dalive'],
            annotations: { readOnlyHint: false, destructiveHint: true },
            title: 'Remove Block',
            description:
                "Remove a block from the storefront: deletes its code (blocks/<blockId>/) and takes it out of this site's DA.live block library (its example page and row), then commits/pushes the deletion and unpublishes the page. The block list follows the code, so this is how a block leaves it. Undo by restoring the block's code and running Refresh Blocks. Destructive: requires confirm:true.",
            inputSchema: {
                projectName: projectNameSchema,
                blockId: z
                    .string()
                    .regex(BLOCK_NAME)
                    .describe(
                        "The block's folder name under blocks/: lowercase words joined by hyphens",
                    ),
                confirm: z
                    .boolean()
                    .optional()
                    .describe(
                        "Must be true — this deletes the block's code, pushes the deletion and unpublishes its page",
                    ),
            },
        },
        async (args: any) => {
            if (args?.confirm !== true) {
                return asText({
                    error: "remove_block_from_library deletes the block's code from the storefront, pushes the deletion and unpublishes its live page. Call again with confirm:true.",
                    destructive: true,
                });
            }
            return asRawText(
                await toolHandlers.removeBlockFromLibrary(
                    projectsDir,
                    args.projectName,
                    args.blockId as string,
                    await resolveCredentials(),
                ),
            );
        },
    );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
