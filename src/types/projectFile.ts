/**
 * The project file contract: one versioned file a project travels in, and the
 * storefront slice of it that travels with a repo.
 *
 * Program plan `.rptc/plans/portable-demos/step-01-contract.md` (PL-56a). Two
 * shapes, one family of names, three homes for the slice:
 *
 *   - our shipped catalog (`demo-packages.json`, a `DemoPackage` entry);
 *   - a colleague's repo root (`demo.demo-builder.json`, a {@link SharedDemoDescription});
 *   - an exported project (`<name>.project.demo-builder.json`, a {@link ProjectFile},
 *     which may carry the slice as `demo` when the project was built on an added demo).
 *
 * The slice is DERIVED from `DemoPackage` (a `Pick`), never copied beside it, so
 * the catalog and the slice cannot drift. The two fields D26/D29 added
 * (`datapack`, `integrations`) live on `DemoPackage` for the same reason.
 *
 * What never travels (D24): a credential. `SECRET_ENV_KEYS` is the register;
 * `readProjectFile` strips them on the way in whatever the file claims, and no
 * field on either shape says whether credentials are included, because they
 * are not.
 *
 * Machine-local manifest fields (paths, statuses, hashes, dates, pinned) are
 * deliberately absent — see the contract step's travels/local table.
 *
 * @module types/projectFile
 */

import type { AiPrompt, Project } from '@/types/base';
import type { CustomBlockLibrary } from '@/types/blockLibraries';
import type {
    CustomIntegrationSource,
    DaLiveContentSource,
    DatapackReference,
    DemoPackage,
} from '@/types/demoPackages';
import type {
    SettingsAdobeContext,
    SettingsConfigs,
    SettingsSelections,
} from '@/types/settingsFile';

/** The exported project's filename suffix: `<project-name>` + this. */
export const PROJECT_FILE_SUFFIX = '.project.demo-builder.json';

/** The shared-demo description file, at the root of a storefront repo. */
export const SHARED_DEMO_FILE_NAME = 'demo.demo-builder.json';

/** The project file's current version. v1 is the pre-2026-09 `SettingsFile`. */
export const PROJECT_FILE_VERSION = 2;

/** The shared-demo description file's current version. */
export const SHARED_DEMO_FILE_VERSION = 1;

/** Prefix of a project's package id when it was built on an added demo, so it never collides with a shipped id. */
export const ADDED_DEMO_ID_PREFIX = 'added:';

/**
 * The storefront slice: what a demo package says about a demo, in any of its
 * three homes. Derived from `DemoPackage` so the catalog cannot drift from it.
 *
 * `blockLibraries` is file-only: our catalog expresses the same fact the other
 * way round (`block-libraries.json`'s `defaultForPackages`), which a colleague's
 * repo cannot edit. It names shipped library ids to pre-tick.
 *
 * `contentSource` is normally read from the repo's `fstab.yaml`; the file may
 * state it to add an `indexPath`, or to override.
 */
export interface SharedDemoDescription
    extends Pick<DemoPackage, 'name' | 'configFlags' | 'requiresMesh' | 'datapack' | 'integrations'> {
    kind: 'demo';
    version: number;
    /** Optional here and below; `DemoPackage` requires them because a shipped brand always has a card and store codes. */
    description?: DemoPackage['description'];
    configDefaults?: DemoPackage['configDefaults'];
    blockLibraries?: string[];
    contentSource?: DaLiveContentSource;
}

/** Where an exported project came from. Provenance, never the receiver's identity. */
export interface ProjectFileSource {
    /** The source project's slug. */
    project: string;
    /** The source project's display title, when it had one. */
    title?: string;
    /** The extension version that wrote the file. */
    extension: string;
    /** The source project's storefront, so a reader can say where it lived; the receiver creates its own. */
    storefront?: {
        githubRepo?: string;
        daLiveOrg?: string;
        daLiveSite?: string;
    };
}

/** The two kinds of storefront a repository can hold. */
export type StorefrontKind = 'eds' | 'headless';

/**
 * The stored storefront row for a project built on an added demo (D2): the
 * slice plus where it came from and what kind it is. Every post-creation
 * lookup resolves this before the catalog.
 */
export interface AddedDemo extends SharedDemoDescription {
    source: { owner: string; repo: string; branch?: string };
    /** Read from the repository when the demo was added, never from the description file. */
    storefrontKind: StorefrontKind;
}

/**
 * What a project travels in. Everything the manifest persists that is not
 * machine-local (the contract step's table), and never a credential.
 */
export interface ProjectFile {
    kind: 'project';
    version: number;
    /** When the file was written (ISO 8601). */
    exportedAt: string;
    source: ProjectFileSource;

    /** The project's display title. */
    title?: string;
    selectedPackage?: string;
    selectedStack?: string;
    selectedAddons?: string[];
    selectedBlockLibraries?: string[];
    customBlockLibraries?: CustomBlockLibrary[];
    /** Present when the project was built on an added demo rather than a shipped brand. */
    demo?: AddedDemo;

    selections?: SettingsSelections;
    /** Config values by component. Credentials are never present. */
    configs: SettingsConfigs;
    commerce?: Project['commerce'];
    commerceStoreStructure?: Project['commerceStoreStructure'];
    datapack?: DatapackReference;

    adobe?: SettingsAdobeContext;
    appBuilderComponentSources?: Record<string, CustomIntegrationSource>;
    componentApiPicks?: Record<string, string[]>;

    aiPrompts?: AiPrompt[];
}
