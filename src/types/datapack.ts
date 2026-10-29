/**
 * The one datapack shape: a pack's identity, the store that holds it, and the pack
 * it was made from.
 *
 * It was written out inline in six places (the project, the wizard state, the
 * manifest, the creation config, the creation install, `configure_project`) beside
 * two named copies (`DatapackReference` here, `DatapackId` in the data-installer
 * feature). None of them said where the pack lived, so every reader assumed the
 * Data Installer service, and a pack saved into the datapack library could not be
 * installed from a copy or an imported file (research
 * `.rptc/research/project-export-datapacks/`, 2026-10-29).
 *
 * @module types/datapack
 */

/**
 * Which store holds a pack: the Data Installer service's catalog, or the team's
 * datapack library, which answers the same routes at its own address.
 */
export type DatapackStoreName = 'installer' | 'library';

/** Identity of a datapack. Both stores key on the pair, so we do too. */
export interface DatapackId {
    name: string;
    version: string;
}

/**
 * A pack and the store that holds it.
 *
 * `store` absent means the Data Installer: every reference written before the store
 * was recorded is one of its packs or a library version nobody can tell apart, and
 * the service is what those readers always asked (rule 3, no migration).
 */
export interface DatapackLocation extends DatapackId {
    store?: DatapackStoreName;
}

/**
 * The datapack a project, a project file or a shared demo names.
 *
 * `version` absent is the demo package's "the catalog's default" (D26); a project
 * always records one (`ProjectDatapack`). `origin` is the pack this one was made
 * from (step 07): a demo's own pack names the library pack it started as, so a
 * colleague whose copy cannot read the demo's pack can carry on with that one.
 */
export interface DatapackReference {
    name: string;
    version?: string;
    store?: DatapackStoreName;
    origin?: DatapackLocation;
}

/** The pack a project holds: a reference whose version is known. */
export type ProjectDatapack = DatapackReference & { version: string };

/**
 * This demo's own pack (step 07): the library pack every save from this project
 * goes into, made at the first save. Never in a project file, so a copy or an
 * import starts from the original's pack and makes its own at its first save.
 */
export interface OwnDatapack {
    /** The pack's name in the library. Immutable there. */
    name: string;
    /** What the SC sees it called, as last saved or renamed. */
    displayName?: string;
    /**
     * True once the SC renamed the pack themselves; until then its display name
     * follows the project's.
     */
    renamed?: boolean;
}

/**
 * The reference as a project can record it, or none.
 *
 * A project records a name AND a version, so a reference naming no version records
 * nothing rather than a guess. Everything else it says (the store, the origin) is
 * kept: two creation paths copied only the name and version, which is how a library
 * pack became a Data Installer one on arrival.
 *
 * @param reference - what a file or a demo names
 * @returns the reference with its version, or undefined
 */
export function recordableDatapack(reference: DatapackReference | undefined): ProjectDatapack | undefined {
    if (!reference?.version) return undefined;
    return { ...reference, version: reference.version };
}

/** The store a reference names, the Data Installer when it names none. */
export function storeOf(reference: { store?: DatapackStoreName }): DatapackStoreName {
    return reference.store ?? 'installer';
}

/**
 * Whether a project's recorded pack can be read, and what creation installs instead when it
 * cannot (step 07). The Datapacks step shows the note, and creation acts on the same answer.
 *
 * - `readable`: the store holds the pack. `mine` and `shared` say whose it is, as the library
 *   says (both false for a Data Installer pack).
 * - `fallback`: it cannot be read; the pack it was made from (or that pack's newest version)
 *   can, and is installed instead.
 * - `none`: neither can be read; the project is created without sample data.
 * - `unknown`: the store could not be asked; the pack is left as recorded.
 */
export type RecordedPackCheck =
    | { verdict: 'readable'; pack: ProjectDatapack; displayName: string; mine: boolean; shared: boolean }
    | { verdict: 'fallback'; pack: ProjectDatapack; displayName: string; note: string }
    | { verdict: 'none'; note: string }
    | { verdict: 'unknown' };

/**
 * Where a colleague would find a pack (the demo package check): the Data Installer, which every
 * SC reads; the library, shared; the library, where only its owner can read it; or nowhere.
 */
export type DatapackAvailability = 'installer' | 'library-shared' | 'library-yours-only' | 'missing';
