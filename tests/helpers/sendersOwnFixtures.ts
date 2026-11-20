/**
 * The "sender's own" enforcer's shared half: the classification walked into a flat
 * list, a project file whose every `sendersOwn` field holds a sentinel, and the
 * leak finder both enforcer suites run their outputs through.
 *
 * The convention and its table: `src/types/projectFileOwnership.ts`. A file sent
 * to someone else cannot point the new project at the sender's cloud resources.
 *
 * WHY TYPED: the fixture is a `ProjectSeed` literal, so `npm run typecheck:tests`
 * rejects a field the file type does not have. Every value is a placeholder; the
 * sentinels are what is traced.
 */

import {
    CONFIG_KEY_OWNERSHIP,
    PROJECT_SEED_OWNERSHIP,
    type FieldVerdict,
} from '@/types/projectFileOwnership';
import type { ProjectSeed } from '@/types/wizard';

/** One classified leaf of the table, by its dotted path into a `ProjectSeed`. */
export interface ClassifiedField {
    path: string;
    verdict: FieldVerdict;
}

function isVerdict(node: unknown): node is FieldVerdict {
    return typeof (node as { verdict?: unknown }).verdict === 'string';
}

/** Every leaf of a classification table, depth first. */
export function classifiedFields(
    table: object = PROJECT_SEED_OWNERSHIP,
    at = ''
): ClassifiedField[] {
    return Object.entries(table).flatMap(([key, node]: [string, unknown]) => {
        const path = at ? `${at}.${key}` : key;
        if (isVerdict(node)) return [{ path, verdict: node }];
        return classifiedFields(node as object, path);
    });
}

/** The component the fixture carries a sendersOwn config key under. */
export const MESH_COMPONENT = 'eds-accs-mesh';

/** The sentinel a sendersOwn field holds: unique per field, so a leak names its source. */
export function sentinelFor(path: string): string {
    return `SENDERS-OWN<${path}>`;
}

/** The dotted path a sendersOwn CONFIG key is planted at. */
export function configPath(key: string): string {
    return `configs.${MESH_COMPONENT}.${key}`;
}

const s = sentinelFor;

/**
 * A project file as an import, a Copy or a bundle hands it over, with EVERY
 * `sendersOwn` field (and every sendersOwn config key) set to its sentinel and
 * every `travels` field set to a plausible value.
 */
export function sendersOwnSeed(): ProjectSeed {
    return {
        kind: 'project',
        version: 2,
        exportedAt: '2026-11-18T00:00:00.000Z',
        source: {
            project: 'sent-demo',
            title: 'Sent Demo',
            extension: '1.0.0-test',
            storefront: {
                githubRepo: s('source.storefront.githubRepo'),
                daLiveOrg: s('source.storefront.daLiveOrg'),
                daLiveSite: s('source.storefront.daLiveSite'),
            },
        },
        title: 'Sent Demo',
        selectedPackage: 'bodea',
        selectedStack: 'eds-accs',
        selectedAddons: [],
        selectedBlockLibraries: [],
        customBlockLibraries: [],
        demo: {
            kind: 'demo',
            version: 2,
            name: 'Shared Demo',
            source: {
                owner: s('demo.source.owner'),
                repo: s('demo.source.repo'),
                branch: s('demo.source.branch'),
            },
            storefrontKind: 'eds',
            contentSource: {
                org: s('demo.contentSource.org'),
                site: s('demo.contentSource.site'),
                indexPath: s('demo.contentSource.indexPath'),
            },
        },
        selections: {
            frontend: 'eds-storefront',
            backend: 'adobe-commerce-accs',
            dependencies: [MESH_COMPONENT],
            integrations: [],
            appBuilder: [],
        },
        configs: {
            'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://example.invalid/graphql' },
            [MESH_COMPONENT]: { MESH_ENDPOINT: s(configPath('MESH_ENDPOINT')) },
        },
        adobe: {
            orgId: s('adobe.orgId'),
            orgName: s('adobe.orgName'),
            projectId: s('adobe.projectId'),
            projectName: s('adobe.projectName'),
            projectTitle: s('adobe.projectTitle'),
            workspaceId: s('adobe.workspaceId'),
            workspaceName: s('adobe.workspaceName'),
            workspaceTitle: s('adobe.workspaceTitle'),
        },
        edsConfig: {
            daLiveOrg: s('edsConfig.daLiveOrg'),
            daLiveSite: s('edsConfig.daLiveSite'),
            githubOwner: s('edsConfig.githubOwner'),
            repoName: s('edsConfig.repoName'),
            repoUrl: s('edsConfig.repoUrl'),
        },
        importedFrom: {
            bundleName: 'Sent Demo',
            bundlePath: '/receiver/Downloads/sent-demo.zip',
            sourceRepository: s('importedFrom.sourceRepository'),
        },
    };
}

/** Every planted sentinel: the table's sendersOwn fields plus its sendersOwn config keys. */
export function plantedFields(): ClassifiedField[] {
    const configKeys = Object.entries(CONFIG_KEY_OWNERSHIP).map(([key, verdict]) => ({
        path: configPath(key),
        verdict,
    }));
    return [...classifiedFields(), ...configKeys].filter((f) => f.verdict.verdict === 'sendersOwn');
}

/** A sentinel found in an output: which field leaked, and where it landed. */
export interface Leak {
    field: string;
    at: string;
}

/** Every string leaf of `value`, by dotted path. */
function stringLeaves(value: unknown, at = ''): Array<[string, string]> {
    if (typeof value === 'string') return [[at, value]];
    if (value === null || typeof value !== 'object') return [];
    return Object.entries(value).flatMap(([key, child]: [string, unknown]) =>
        stringLeaves(child, at ? `${at}.${key}` : key)
    );
}

/**
 * Where each planted sentinel landed in `output`, minus the landings `allowed`
 * permits for that field. A provenance field (`readAs: 'provenance'`) may land
 * anywhere except a path matching `writeTargets`.
 */
export function sendersOwnLeaks(
    output: unknown,
    options: { allowed?: Record<string, RegExp[]>; writeTargets: RegExp }
): Leak[] {
    const leaves = stringLeaves(output);
    return plantedFields().flatMap(({ path, verdict }) => {
        const sentinel = sentinelFor(path);
        const landed = leaves.filter(([, text]) => text.includes(sentinel)).map(([at]) => at);
        const isProvenance = verdict.verdict === 'sendersOwn' && verdict.readAs === 'provenance';
        const allowed = options.allowed?.[path] ?? [];
        return landed
            .filter((at) => (isProvenance ? options.writeTargets.test(at) : true))
            .filter((at) => !allowed.some((pattern) => pattern.test(at)))
            .map((at) => ({ field: path, at }));
    });
}

/** Read a dotted path out of a value. */
export function valueAt(value: unknown, path: string): unknown {
    return path
        .split('.')
        .reduce<unknown>(
            (node, key) =>
                node !== null && typeof node === 'object'
                    ? (node as Record<string, unknown>)[key]
                    : undefined,
            value
        );
}
