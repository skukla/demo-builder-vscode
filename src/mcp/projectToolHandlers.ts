/**
 * Project-scoped MCP tool handlers — the manifest/config file surface.
 *
 * `list_projects`, `get_project`, `get_component_config`,
 * `update_project_config`: pure filesystem reads/writes guarded by
 * `projectSecurity`, plus the token-lean manifest summary and the shared
 * `paginate` helper the list tools use.
 *
 * Split from `mcp-server.ts` (god-file decomposition, 2026-08-23); the
 * combined `toolHandlers` object there spreads this map back in, so direct
 * callers and the registration wiring are unchanged.
 *
 * @module mcp/projectToolHandlers
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { DEFAULT_LIST_LIMIT } from './blockAuthoring';
import {
    assertInsideProject,
    isAllowedConfigPath,
    resolveProjectPath,
    validateEnvContent,
} from './projectSecurity';
import { validateManifestShape } from '@/core/state/manifestValidation';
import { writeFileAtomic } from '@/core/utils/writeFileAtomic';
import { stripManifestSecrets } from '@/features/components/config/envVarKeys';

/**
 * Produce a token-lean view of a project manifest for `getProject`.
 *
 * The full manifest can carry large arrays (saved AI prompts, per-library block
 * ID lists) and per-component metadata blobs that an agent rarely needs up front.
 * The summary keeps every top-level scalar/object but collapses the known
 * unbounded fields:
 *   - `aiPrompts`            → a count placeholder
 *   - `installedBlockLibraries` → name + source + blockCount (drops the blockIds list)
 *   - `componentInstances`   → id → { path } (drops the metadata blob)
 *
 * Callers that need the untouched manifest pass `full: true`.
 */
export function summarizeManifest(manifest: Record<string, unknown>): Record<string, unknown> {
    const summary: Record<string, unknown> = { ...manifest };

    if (Array.isArray(manifest.aiPrompts)) {
        summary.aiPrompts = `[${manifest.aiPrompts.length} prompt(s) — pass full:true to expand]`;
    }

    // The AI-bundle drift map: one SHA per generated file. Measured live
    // 2026-08-16 it was 4,479 bytes of a 9,895-byte "summary" — 45% — on a real
    // project, and it post-dates the two collapses above, which is the only
    // reason it was never folded in. An agent never needs the hashes; it needs
    // to know whether the bundle drifted, and that comparison happens
    // extension-side. Same waste as the raw `who_created` in
    // list_adobe_projects: the input to a comparison, useless to the recipient.
    if (manifest.aiFileHashes && typeof manifest.aiFileHashes === 'object') {
        const count = Object.keys(manifest.aiFileHashes as Record<string, unknown>).length;
        summary.aiFileHashes = `[${count} file hash(es) — pass full:true to expand]`;
    }

    if (Array.isArray(manifest.installedBlockLibraries)) {
        summary.installedBlockLibraries = manifest.installedBlockLibraries.map((lib) => {
            const entry = lib as { name?: unknown; source?: unknown; blockIds?: unknown };
            return {
                name: entry.name,
                source: entry.source,
                blockCount: Array.isArray(entry.blockIds) ? entry.blockIds.length : 0,
            };
        });
    }

    const components = manifest.componentInstances;
    if (components && typeof components === 'object') {
        summary.componentInstances = Object.fromEntries(
            Object.entries(components as Record<string, unknown>).map(([id, inst]) => {
                const path = (inst as { path?: unknown } | null)?.path;
                return [id, { path }];
            }),
        );
    }

    return summary;
}

/**
 * Apply optional offset/limit slicing to a list result. Both bounds are
 * clamped to safe values so malformed input degrades to "return everything"
 * rather than throwing. Returns the array unchanged when neither is provided.
 */
export function paginate<T>(items: T[], offset?: number, limit?: number): T[] {
    const start = typeof offset === 'number' && Number.isInteger(offset) && offset > 0 ? offset : 0;
    const validLimit =
        typeof limit === 'number' && Number.isInteger(limit) && limit >= 0 ? limit : undefined;
    if (start === 0 && validLimit === undefined) return items;
    const end = validLimit === undefined ? undefined : start + validLimit;
    return items.slice(start, end);
}

/** The project-file tool handlers (spread into `toolHandlers` in mcp-server). */
export const projectToolHandlers = {
    async listProjects(
        projectsDir: string,
        offset?: number,
        // Defaulted HERE, not only in the tool's zod schema. The schema default
        // is applied by the MCP SDK, so a direct call — a test, or any non-MCP
        // caller — still got the whole list. 300 projects measured 18,191 bytes.
        limit: number = DEFAULT_LIST_LIMIT,
    ): Promise<string> {
        let entries: Array<{ name: string; isDirectory: () => boolean }>;
        try {
            entries = await fsPromises.readdir(projectsDir, { withFileTypes: true });
        } catch {
            return JSON.stringify([]);
        }
        const projects: Array<{ name: string; path: string; status: string; pinned?: boolean }> = [];
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const dirPath = path.join(projectsDir, entry.name);
            const manifestPath = path.join(dirPath, '.demo-builder.json');
            try {
                await fsPromises.stat(manifestPath);
                const raw = await fsPromises.readFile(manifestPath, 'utf-8');
                const manifest = JSON.parse(raw);
                projects.push({
                    name: manifest.name ?? entry.name,
                    path: dirPath,
                    status: manifest.status ?? 'unknown',
                    // Only when SET. `set_project_pinned` was a write nothing could
                    // confirm — no read reported pinned state anywhere — and a write
                    // with no read is a write an agent has to take on faith. Omitted
                    // when false/absent so the common case costs no tokens.
                    ...(manifest.pinned ? { pinned: true } : {}),
                });
            } catch {
                // Skip directories without valid .demo-builder.json
            }
        }
        return JSON.stringify(paginate(projects, offset, limit));
    },

    async getProject(projectsDir: string, projectName: string, full = false): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const jsonPath = path.join(projectPath, '.demo-builder.json');
        try {
            const raw = await fsPromises.readFile(jsonPath, 'utf-8');
            const manifest = JSON.parse(raw);
            // Secrets are stripped BEFORE anything else looks at the manifest, and
            // on the `full` path too.
            //
            // Found by probing the live server (2026-08-17): a real project's
            // response carried its ACCS_OAUTH_CLIENT_SECRET in plaintext, so every
            // agent that read the project put a working Commerce credential into
            // its transcript — and into whatever logs that transcript reaches.
            //
            // `full: true` is not an exemption. It is the MORE dangerous path: it
            // is what an agent reaches for when the summary looks incomplete, and
            // "the caller asked for everything" is not consent from the person
            // whose credential it is.
            //
            // This is the convention `export_project_settings` already follows in
            // the other direction — secrets go to the FILE, never the response.
            //
            // `stripManifestSecrets`, not `stripSecretValues`: componentConfigs is
            // not the only place the manifest keeps env values. Four staleness
            // baselines carry flat snapshots too, and stripping only the first left
            // `ADOBE_CATALOG_API_KEY` readable through this very tool — the same
            // leak, one field over.
            const safe = stripManifestSecrets(manifest);
            // Compact JSON (no indentation) — the response is consumed as LLM
            // context, not read by a human, so whitespace is pure token waste.
            return JSON.stringify(full ? safe : summarizeManifest(safe));
        } catch (err) {
            return `Error reading project state: ${err instanceof Error ? err.message : String(err)}`;
        }
    },

    async getComponentConfig(
        projectsDir: string,
        projectName: string,
        configRelPath: string,
    ): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const resolved = path.resolve(projectPath, configRelPath);
        const { realProjectPath, realResolved } = await assertInsideProject(projectPath, resolved);
        if (!isAllowedConfigPath(realProjectPath, realResolved)) {
            throw new Error(
                `Reading ${configRelPath} is not permitted. Allowed: .demo-builder.json, .env files.`,
            );
        }
        return fsPromises.readFile(resolved, 'utf-8');
    },

    async updateProjectConfig(
        projectsDir: string,
        projectName: string,
        configRelPath: string,
        content: string,
    ): Promise<string> {
        const projectPath = resolveProjectPath(projectsDir, projectName);
        const resolved = path.resolve(projectPath, configRelPath);
        const { realProjectPath, realResolved } = await assertInsideProject(projectPath, resolved);
        if (!isAllowedConfigPath(realProjectPath, realResolved)) {
            throw new Error(
                `Writing to ${configRelPath} is not permitted. Allowed: .demo-builder.json, .env files.`,
            );
        }
        if (path.basename(realResolved) === '.env') {
            validateEnvContent(content);
        }
        // The manifest is the OTHER writer's serialized state (ProjectConfigWriter);
        // this tool writes agent-supplied bytes. Malformed JSON here bricks every
        // later load, so refuse it outright; schema drift is reported but allowed
        // (the loader's own validation is warn-mode for the same reason —
        // user/agent data must not hard-fail on a schema the extension evolves).
        let schemaWarnings: string[] = [];
        if (path.basename(realResolved) === '.demo-builder.json') {
            let parsed: unknown;
            try {
                parsed = JSON.parse(content);
            } catch (parseError) {
                throw new Error(
                    `Refusing to write ${configRelPath}: content is not valid JSON ` +
                        `(${parseError instanceof Error ? parseError.message : String(parseError)}). ` +
                        'A malformed manifest would break every subsequent project load.',
                );
            }
            schemaWarnings = validateManifestShape(parsed);
        }
        await fsPromises.mkdir(path.dirname(resolved), { recursive: true });
        // Atomic write (temp + rename): the manifest may be read/written
        // concurrently by the extension's StateManager; a partial write would
        // corrupt it. rename(2) makes the swap atomic.
        await writeFileAtomic(resolved, content);
        return schemaWarnings.length > 0
            ? `Updated ${configRelPath} (schema warnings: ${schemaWarnings.join('; ')})`
            : `Updated ${configRelPath}`;
    },
};
