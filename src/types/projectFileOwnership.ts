/**
 * Whose is each field of a file sent to someone else: does it TRAVEL to the
 * receiver's project, or is it the SENDER'S OWN cloud resource?
 *
 * The convention (owner, 2026-11-18, for beta.153): a file sent to someone else
 * cannot point the new project at the sender's cloud resources. F280 was the
 * breach: the project file carried the sender's Adobe project and workspace, the
 * wizard seeded both, and creation deployed the mesh into the sender's workspace,
 * replacing that demo's mesh.
 *
 * This module is the classification, typed so the compiler keeps it complete.
 * {@link PROJECT_SEED_OWNERSHIP} `satisfies` {@link Ownership}`<ProjectSeed>`: a
 * field added to `ProjectFile`, `ProjectSeed` or any interface nested inside them,
 * and not classified here, is a compile error (`npm run typecheck`). The
 * enforcer that reads it is
 * `tests/features/project-creation/ui/wizard/sendersOwnFields.test.tsx` (the
 * wizard's Import and Copy) and
 * `tests/features/ai/server/createProjectFromFile-sendersOwn.test.ts` (the agent's
 * `create_project_from_file`): each fills every `sendersOwn` field with a sentinel
 * and asserts the sentinel reaches no creation state.
 *
 * `configs` is a `Record` keyed by env-var name, so the compiler cannot list its
 * inner keys; {@link CONFIG_KEY_OWNERSHIP} classifies them instead, and the
 * enforcer fails when the component catalog declares an env var it does not name.
 *
 * Pure data: nothing in `src/` reads this at runtime.
 *
 * @module types/projectFileOwnership
 */

import type { ProjectSeed } from '@/types/wizard';

/** The field may be read into the receiver's project. */
export interface TravelsVerdict {
    readonly verdict: 'travels';
    readonly why: string;
}

/**
 * The field names a cloud resource the SENDER owns. It never becomes the new
 * project's own resource.
 *
 * `readAs: 'provenance'`: the field may be READ (a template to generate from, a
 * content site to copy from, a note of where the demo came from) but must never
 * be a WRITE target: not the new repository, not the DA.live destination, not the
 * Adobe project or workspace creation deploys into. Without it the field may not
 * reach creation state at all.
 */
export interface SendersOwnVerdict {
    readonly verdict: 'sendersOwn';
    readonly why: string;
    readonly readAs?: 'provenance';
}

export type FieldVerdict = TravelsVerdict | SendersOwnVerdict;

/**
 * An interface (not an array, not a string-keyed `Record`): its fields are
 * classified one by one. Wrapped in a tuple so a union is not distributed.
 */
type IsBranch<V> = [V] extends [readonly unknown[]]
    ? false
    : [V] extends [object]
      ? string extends keyof V
          ? false
          : true
      : false;

/**
 * One verdict per field of `T`, required for every key, optional ones included.
 *
 * A nested interface is classified field by field, or — only when ALL of it is the
 * sender's — by one `sendersOwn` verdict. A whole `travels` verdict on an interface
 * is refused, because a field added to it later would travel unclassified.
 */
export type Ownership<T> = {
    readonly [K in keyof T]-?: IsBranch<NonNullable<T[K]>> extends true
        ? SendersOwnVerdict | Ownership<NonNullable<T[K]>>
        : FieldVerdict;
};

const travels = (why: string): TravelsVerdict => ({ verdict: 'travels', why });
const sendersOwn = (why: string): SendersOwnVerdict => ({ verdict: 'sendersOwn', why });
const provenance = (why: string): SendersOwnVerdict => ({
    verdict: 'sendersOwn',
    why,
    readAs: 'provenance',
});

const FORMAT = 'Describes the file itself, not a resource.';
const CHOICE = 'A catalog choice: the receiver builds the same kind of demo.';
const PUBLIC_REF =
    'A public Adobe template, patch ledger or package version, read and never written.';

/** A GitHub repository read as a source, never written. */
const readOnlyRepo = (what: string): Ownership<{ owner: string; repo: string }> => ({
    owner: travels(`${what}: read as a source, never written.`),
    repo: travels(`${what}: read as a source, never written.`),
});

/** A datapack, by name and version: read from its store, installed by the receiver. */
const DATAPACK: Ownership<NonNullable<ProjectSeed['datapack']>> = {
    name: travels('The datapack to install; the receiver installs it into their own backend.'),
    version: travels('The datapack version to install.'),
    store: travels(
        'Where the pack is read from; a colleague’s pack is copied into the receiver’s own store first.',
    ),
    origin: {
        name: travels('The pack this one was made from: the fallback when it cannot be read.'),
        version: travels('The fallback pack’s version.'),
        store: travels('Where the fallback pack is read from.'),
    },
};

/** The storefront row of a project built on an added demo (D2). */
const ADDED_DEMO: Ownership<NonNullable<ProjectSeed['demo']>> = {
    kind: travels(FORMAT),
    version: travels(FORMAT),
    name: travels('The demo’s display name.'),
    description: travels('The demo’s card text.'),
    configFlags: travels('Storefront config flags the demo sets.'),
    configDefaults: travels('Brand data and store codes the demo defaults to.'),
    requiresMesh: travels('Whether the demo needs a mesh; the receiver deploys their own.'),
    datapack: DATAPACK,
    integrations: {
        catalog: travels(
            'Catalog integration ids; the receiver deploys them into their own workspace.',
        ),
        custom: travels(
            'Custom integrations by repository: read and deployed into the receiver’s workspace.',
        ),
    },
    blockLibraries: travels('Shipped block library ids to pre-tick.'),
    contentSource: {
        org: provenance('The sender’s DA.live org: pages are copied FROM it, never written to it.'),
        site: provenance(
            'The sender’s DA.live site: pages are copied FROM it, never written to it.',
        ),
        indexPath: provenance('Where the sender’s site lists its pages: read to copy them.'),
    },
    builtWith: {
        package: travels('The shipped package id the storefront was built on.'),
        template: readOnlyRepo('The template the storefront was generated from'),
        lkg: travels(PUBLIC_REF),
        codePatchSource: {
            owner: travels(PUBLIC_REF),
            repo: travels(PUBLIC_REF),
            path: travels(PUBLIC_REF),
            lkgFile: travels(PUBLIC_REF),
        },
        codePatches: travels('Patch ids the storefront carries.'),
        patchesRelease: travels(PUBLIC_REF),
        boilerplate: { name: travels(PUBLIC_REF), version: travels(PUBLIC_REF) },
        extension: travels('The Demo Builder version that saved it.'),
    },
    source: {
        owner: provenance(
            'The demo’s repository: the receiver’s storefront is generated FROM it, never pushed to it.',
        ),
        repo: provenance(
            'The demo’s repository: the receiver’s storefront is generated FROM it, never pushed to it.',
        ),
        branch: provenance('The demo repository’s branch, read as the generation source.'),
    },
    storefrontKind: travels('EDS or headless: what kind of storefront the demo is.'),
    boilerplate: { name: travels(PUBLIC_REF), version: travels(PUBLIC_REF) },
    lineage: {
        templateRepository: readOnlyRepo('The template GitHub records for the demo repository'),
        forkParent: readOnlyRepo('The fork parent GitHub records for the demo repository'),
    },
};

/** Every field a project file, Copy's seed or an import's seed can carry. */
export const PROJECT_SEED_OWNERSHIP = {
    kind: travels(FORMAT),
    version: travels(FORMAT),
    exportedAt: travels(FORMAT),
    source: {
        project: travels(
            'The source project’s slug: suggests the new project’s local name, no resource.',
        ),
        title: travels('The source project’s display title.'),
        extension: travels('The extension version that wrote the file.'),
        storefront: {
            githubRepo: provenance(
                'The sender’s repository: names where the demo lived; the receiver creates their own.',
            ),
            daLiveOrg: provenance(
                'The sender’s DA.live org: provenance; the receiver names their own.',
            ),
            daLiveSite: provenance(
                'The sender’s DA.live site: provenance; the receiver names their own.',
            ),
        },
    },
    title: travels('The project’s display title.'),
    selectedPackage: travels(CHOICE),
    selectedStack: travels(CHOICE),
    selectedAddons: travels(CHOICE),
    selectedBlockLibraries: travels(CHOICE),
    customBlockLibraries: travels(
        'Block libraries by repository: read and installed, never written.',
    ),
    demo: ADDED_DEMO,
    selections: {
        frontend: travels(CHOICE),
        backend: travels(CHOICE),
        dependencies: travels(CHOICE),
        integrations: travels(CHOICE),
        appBuilder: travels(CHOICE),
    },
    configs: travels(
        'Settings by component, credentials stripped. The Commerce backend is shared demo infrastructure ' +
            'the receiver connects to with their own credentials. Inner keys: CONFIG_KEY_OWNERSHIP.',
    ),
    commerce: {
        type: travels('PaaS or SaaS: the kind of backend.'),
        instance: {
            url: travels('The shared Commerce backend; no creation path reads this field.'),
            environmentId: travels(
                'The shared Commerce backend; no creation path reads this field.',
            ),
            storeView: travels('A store code on the shared backend.'),
            websiteCode: travels('A store code on the shared backend.'),
            storeCode: travels('A store code on the shared backend.'),
        },
    },
    commerceStoreStructure: {
        websites: travels(
            'The discovered store hierarchy of the shared backend, for naming scopes.',
        ),
        storeGroups: travels(
            'The discovered store hierarchy of the shared backend, for naming scopes.',
        ),
        storeViews: travels(
            'The discovered store hierarchy of the shared backend, for naming scopes.',
        ),
    },
    datapack: DATAPACK,
    adobe: {
        orgId: sendersOwn('The sender’s Adobe org: sign-in decides the receiver’s (F280).'),
        orgName: sendersOwn('The sender’s Adobe org name (F280).'),
        projectId: sendersOwn('The sender’s Adobe project: the receiver chooses their own (F280).'),
        projectName: sendersOwn('The sender’s Adobe project name (F280).'),
        projectTitle: sendersOwn('The sender’s Adobe project title (F280).'),
        workspaceId: sendersOwn(
            'The sender’s workspace: creation deployed the mesh into it (F280). Carried only as ' +
                '`importedWorkspaceId`, a comparison key that reuses an imported mesh when the SC chose ' +
                'the same workspace themselves.',
        ),
        workspaceName: sendersOwn('The sender’s workspace name (F280).'),
        workspaceTitle: sendersOwn('The sender’s workspace title (F280).'),
    },
    appBuilderComponentSources: travels(
        'Custom integrations by repository: read and deployed into the receiver’s own workspace.',
    ),
    componentApiPicks: travels(
        'Console API codes the integrations need, subscribed in the receiver’s workspace.',
    ),
    aiPrompts: travels('Saved prompt text; no resource.'),
    edsConfig: {
        daLiveOrg: sendersOwn(
            'The project’s own DA.live org: Edit reopens it; an import creates its own.',
        ),
        daLiveSite: sendersOwn(
            'The project’s own DA.live site: Edit reopens it; an import creates its own.',
        ),
        githubOwner: sendersOwn('The project’s own repository owner: Edit only.'),
        repoName: sendersOwn('The project’s own repository: Edit only.'),
        repoUrl: sendersOwn('The project’s own repository: Edit only.'),
    },
    importedFrom: {
        bundleName: travels('The bundle’s display name.'),
        bundlePath: travels('Where the bundle sits on the receiver’s own machine.'),
        sourceRepository: provenance(
            'The sender’s repository, provenance only: the bundle’s files are the source.',
        ),
    },
} as const satisfies Ownership<ProjectSeed>;

const COMMERCE_KEY = travels('A Commerce or Catalog Service setting of the shared backend.');
const SERVICE_KEY = travels('A setting of a shared Adobe service the demo connects to.');
const SECRET_KEY = travels(
    'A credential: never in the file (SECRET_ENV_KEYS strips it on write and on read).',
);

/**
 * The inner keys of `configs`: every env var the component catalog declares.
 *
 * Keyed by the catalog's env-var NAMES (`components.json`), which no type lists,
 * so completeness is checked by the enforcer rather than the compiler.
 */
export const CONFIG_KEY_OWNERSHIP: Readonly<Record<string, FieldVerdict>> = {
    ACCS_CATALOG_SERVICE_ENDPOINT: COMMERCE_KEY,
    ACCS_CUSTOMER_GROUP: COMMERCE_KEY,
    ACCS_GRAPHQL_ENDPOINT: COMMERCE_KEY,
    ACCS_STORE_CODE: COMMERCE_KEY,
    ACCS_STORE_VIEW_CODE: COMMERCE_KEY,
    ACCS_WEBSITE_CODE: COMMERCE_KEY,
    ACO_API_KEY: SECRET_KEY,
    ACO_API_URL: SERVICE_KEY,
    ACO_ENVIRONMENT_ID: SERVICE_KEY,
    ACO_TENANT_ID: SERVICE_KEY,
    ADOBE_ASSETS_URL: SERVICE_KEY,
    ADOBE_CATALOG_API_KEY: SECRET_KEY,
    ADOBE_CATALOG_SERVICE_ENDPOINT: COMMERCE_KEY,
    ADOBE_COMMERCE_ADMIN_PASSWORD: SECRET_KEY,
    ADOBE_COMMERCE_ADMIN_URL: COMMERCE_KEY,
    ADOBE_COMMERCE_ADMIN_USERNAME: COMMERCE_KEY,
    ADOBE_COMMERCE_CUSTOMER_GROUP: COMMERCE_KEY,
    ADOBE_COMMERCE_ENVIRONMENT_ID: COMMERCE_KEY,
    ADOBE_COMMERCE_GRAPHQL_ENDPOINT: COMMERCE_KEY,
    ADOBE_COMMERCE_STORE_CODE: COMMERCE_KEY,
    ADOBE_COMMERCE_STORE_VIEW_CODE: COMMERCE_KEY,
    ADOBE_COMMERCE_URL: COMMERCE_KEY,
    ADOBE_COMMERCE_WEBSITE_CODE: COMMERCE_KEY,
    AEM_ASSETS_ENABLED: travels('A storefront flag.'),
    EXPERIENCE_PLATFORM_API_KEY: SECRET_KEY,
    EXPERIENCE_PLATFORM_DATASTREAM_ID: SERVICE_KEY,
    MESH_ENDPOINT: sendersOwn(
        'The sender’s deployed mesh. Carried only as `importedMeshEndpoint`, reused when the SC chose ' +
            'the sender’s workspace themselves; generated files take the new mesh’s endpoint instead.',
    ),
    PAAS_CATALOG_SERVICE_ENDPOINT: COMMERCE_KEY,
};
