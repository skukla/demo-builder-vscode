/**
 * create_project_from_file — start a project from an exported project file.
 *
 * The agent's counterpart to the projects list's Import. That door opens a file
 * picker and then the wizard; this one takes a PATH, reads the file through the
 * typed reader (`readProjectFile`: v2 passes through, v1 — what Export writes
 * today — migrates, credentials are stripped whatever the file claims), and
 * creates through `runProjectCreation`, the same path `create_project` ends in.
 * There is no second creation pipeline.
 *
 * WHAT THE FILE DECIDES: the package, the stack, the addons, block libraries,
 * settings, integrations (with their custom sources and API picks), the mesh,
 * the datapack and the discovered store structure.
 *
 * WHAT IT NEVER DECIDES, because none of it is the receiver's:
 *  - sign-ins — every one is pre-flighted as `create_project` does, and a
 *    missing one answers a `needsAuth` handoff;
 *  - the Adobe workspace — the one the agent's session has selected is used,
 *    never the one the file was exported from;
 *  - the storefront repository and DA.live site — the file carries the sender's
 *    as provenance only, so an Edge Delivery file needs the receiver's own;
 *  - credentials — they are never in the file. The answer names the ones the
 *    new project still needs.
 *
 * Nothing the file says is dropped silently: what was applied, and what was not
 * and why, both come back in the answer.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { declaredEnvVarKeys } from './componentRequirementsTool';
import { parseStoreScope, runProjectCreation, type CreationSeed } from './createProjectTool';
import { asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import { storeScopeSchema } from './storeScope';
import { ACCS_GRAPHQL_ENDPOINT, SECRET_ENV_KEYS } from '@/core/config/envVarKeys';
import { readProjectFile, type ReadProjectFileResult } from '@/core/state/projectFileReader';
import { getStackById } from '@/features/components/services/demoPackageLoader';
import { integrationStateFromSettings } from '@/features/project-creation/ui/wizard/integrationStateFromSettings';
import type { HandlerContext } from '@/types/handlers';
import type { ProjectFile } from '@/types/projectFile';

/** A project file is a few kilobytes; anything near this is not one. */
const MAX_PROJECT_FILE_BYTES = 1024 * 1024;

type ReadOk = Extract<ReadProjectFileResult, { ok: true }>;

/** Read and validate the file at `filePath`, or say why it cannot be used. */
async function readFileAt(filePath: string): Promise<ReadOk | { error: string }> {
    if (!path.isAbsolute(filePath)) {
        return { error: 'filePath must be an absolute path to an exported project file.' };
    }
    let size: number;
    try {
        const stat = await fsPromises.stat(filePath);
        if (!stat.isFile()) return { error: `${filePath} is not a file.` };
        size = stat.size;
    } catch {
        return { error: `No file at ${filePath}.` };
    }
    if (size > MAX_PROJECT_FILE_BYTES) {
        return { error: `${filePath} is too large to be a project file (over 1 MB).` };
    }
    const read = readProjectFile(await fsPromises.readFile(filePath, 'utf8'));
    return read.ok ? read : { error: read.error };
}

/** The file's selections as creation inputs. */
function seedFrom(file: ProjectFile): CreationSeed {
    const { datapack } = file;
    return {
        componentConfigs: file.configs,
        selectedAddons: file.selectedAddons,
        selectedBlockLibraries: file.selectedBlockLibraries,
        customBlockLibraries: file.customBlockLibraries,
        ...integrationStateFromSettings(file),
        // Creation records a datapack by name AND version; a file naming no
        // version is reported as not applied rather than guessed at.
        datapack: datapack?.version ? { name: datapack.name, version: datapack.version } : undefined,
        storeDiscoveryData: file.commerceStoreStructure,
    };
}

/** What the answer says came from the file, in the order an SC would list it. */
function appliedFrom(file: ProjectFile, seed: CreationSeed): string[] {
    const has = (list: unknown[] | undefined): boolean => (list?.length ?? 0) > 0;
    const applied: Array<[string, boolean]> = [
        ['package', true],
        ['stack', true],
        ['settings', Object.keys(file.configs).length > 0],
        ['addons', has(seed.selectedAddons)],
        ['block libraries', has(seed.selectedBlockLibraries) || has(seed.customBlockLibraries)],
        ['integrations', has(seed.selectedAppBuilderComponents)],
        ['datapack', Boolean(seed.datapack)],
        ['store structure', Boolean(seed.storeDiscoveryData)],
    ];
    return applied.filter(([, present]) => present).map(([name]) => name);
}

/** What the file carries that creation does not take from it, each with its reason. */
function notAppliedFrom(file: ProjectFile, seed: CreationSeed): Array<{ field: string; why: string }> {
    const skipped: Array<[string, boolean, string]> = [
        ['title', Boolean(file.title), 'The new project is named by this call, not by the file.'],
        [
            'adobe',
            Boolean(file.adobe),
            'The project is created in the Adobe workspace you have selected, not the one it was exported from.',
        ],
        [
            'commerce',
            Boolean(file.commerce),
            'The Commerce connection is not set by creation; connect the new project to its instance.',
        ],
        [
            'datapack',
            Boolean(file.datapack) && !seed.datapack,
            'The file names a datapack with no version, so none was recorded.',
        ],
        ['aiPrompts', (file.aiPrompts?.length ?? 0) > 0, 'Saved AI prompts are not created with a project.'],
    ];
    return skipped.filter(([, present]) => present).map(([field, , why]) => ({ field, why }));
}

/** The credentials the new project's components declare. A file never carries one. */
function credentialsNeeded(
    stackId: string,
    seed: CreationSeed,
): Array<{ component: string; key: string }> {
    const stack = getStackById(stackId);
    const components = [
        stack?.frontend,
        stack?.backend,
        ...(stack?.dependencies ?? []),
        ...(seed.selectedAppBuilderComponents ?? []),
        ...(seed.selectedAddons ?? []),
    ].filter((id): id is string => Boolean(id));
    return [...new Set(components)].flatMap((component) =>
        declaredEnvVarKeys(component)
            .filter((key) => SECRET_ENV_KEYS.includes(key))
            .map((key) => ({ component, key })),
    );
}

/** The Commerce endpoint the file recorded for the stack's backend, if any. */
function endpointFrom(file: ProjectFile, stackId: string): string | undefined {
    const backend = getStackById(stackId)?.backend;
    const value = backend ? file.configs[backend]?.[ACCS_GRAPHQL_ENDPOINT] : undefined;
    return typeof value === 'string' && value ? value : undefined;
}

const text = (value: unknown): string | undefined => (value ? String(value) : undefined);

/**
 * Register `create_project_from_file`.
 *
 * @param server     The tool server.
 * @param ctxFactory Builds a headless HandlerContext per call.
 */
export function registerCreateProjectFromFileTool(
    server: McpToolServer,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'create_project_from_file',
        {
            needsAuth: ['github', 'dalive'],
            annotations: { readOnlyHint: false, destructiveHint: false },
            title: 'Create Project From File',
            description:
                'Create a new project from an exported project file (what export_project_settings writes). ' +
                'The file decides the package, stack, addons, ' +
                'settings, integrations and mesh; sign-ins, the Adobe workspace and credentials are ' +
                "always yours, and the answer lists what is still needed. An Edge Delivery file also " +
                'needs your own repoName, daLiveOrg and daLiveSite. Requires confirm:true',
            inputSchema: {
                filePath: z.string().describe('Absolute path to the exported project file'),
                projectName: z.string().describe('Name for the new project'),
                repoName: z
                    .string()
                    .optional()
                    .describe('EDS only: name for YOUR new GitHub storefront repo'),
                githubOwner: z
                    .string()
                    .optional()
                    .describe(
                        'EDS only: the GitHub account or organization to create the repo under (default: the signed-in account)',
                    ),
                daLiveOrg: z.string().optional().describe('EDS only: your DA.live organization'),
                daLiveSite: z.string().optional().describe('EDS only: your DA.live site name'),
                accsEndpoint: z
                    .string()
                    .optional()
                    .describe(
                        'EDS + ACCS only: Adobe Commerce Cloud GraphQL endpoint (default: the one the file recorded)',
                    ),
                // The file records its sender's codes; a store other than theirs has its
                // own. Same input as configure_project; the file's codes when omitted.
                storeScope: storeScopeSchema.optional(),
                confirm: z
                    .boolean()
                    .optional()
                    .describe(
                        'Must be true — creates a project (clones repos, installs deps, deploys the integrations the file names; EDS also creates a real GitHub repo + DA.live content)',
                    ),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const projectName = String(args?.projectName ?? '').trim();
            const filePath = String(args?.filePath ?? '').trim();
            if (!projectName || !filePath) {
                return asText({ error: 'projectName and filePath are both required.' });
            }
            const read = await readFileAt(filePath);
            if ('error' in read) return asText({ error: read.error });
            const { file } = read;
            if (!file.selectedStack) {
                return asText({ error: 'This project file names no stack, so there is nothing to build.' });
            }
            if (!file.selectedPackage) {
                return asText({
                    error: 'This project file names no demo package, so there is nothing to build.',
                });
            }

            const scope = parseStoreScope(file.selectedStack, args?.storeScope);
            if ('error' in scope) return asText(scope);
            const seed = seedFrom(file);
            if (args?.confirm !== true) {
                return asText({
                    error: 'create_project_from_file requires confirm:true — it installs dependencies, deploys the integrations the file names and, for EDS, creates a real GitHub repo + DA.live content. Ask the user to confirm.',
                    wouldCreate: {
                        package: file.selectedPackage,
                        stack: file.selectedStack,
                        integrations: seed.selectedAppBuilderComponents ?? [],
                        addons: seed.selectedAddons ?? [],
                    },
                });
            }

            return runProjectCreation(ctxFactory(), {
                projectName,
                pkgId: file.selectedPackage,
                stackId: file.selectedStack,
                repoName: text(args.repoName),
                githubOwner: text(args.githubOwner),
                daLiveOrg: text(args.daLiveOrg),
                daLiveSite: text(args.daLiveSite),
                accsEndpoint: text(args.accsEndpoint) ?? endpointFrom(file, file.selectedStack),
                storeScope: scope.storeScope,
                seed,
                report: {
                    fromFile: {
                        sourceProject: file.source.project,
                        ...(read.migratedFrom ? { migratedFromVersion: read.migratedFrom } : {}),
                        ...(read.newerThanSupported
                            ? {
                                  warning:
                                      'This file was written by a newer Demo Builder. What this version understands was used.',
                              }
                            : {}),
                        applied: appliedFrom(file, seed),
                        notApplied: notAppliedFrom(file, seed),
                    },
                    stillNeeded: {
                        credentials: credentialsNeeded(file.selectedStack, seed),
                        how: 'A project file never carries a credential. Set each with update_project_config, or have the user enter it in Configure.',
                    },
                },
            });
        },
    );
}
