/**
 * Read a project file: v2 passes through, v1 migrates, anything else is refused
 * in a sentence an SC can act on.
 *
 * READ-SIDE, like `projectFileLoader`'s manifest migrations: the file on disk is
 * never rewritten. A v1 file (the pre-2026-09 `SettingsFile`) is the only older
 * shape that exists; its migration is total, so a reader never has to branch on
 * the version again. A NEWER version is read as far as this build understands
 * it and flagged, never refused — files cross extension versions in both
 * directions, the same rule the manifest schema follows.
 *
 * Credentials never travel (D24). They are stripped here whatever the file
 * claims, so a v1 file written "with secrets" and a v2 file someone hand-edited
 * both come out clean.
 *
 * @module core/state/projectFileReader
 */

import Ajv, { type ValidateFunction } from 'ajv';
import { stripSecretValues } from '@/core/config/envVarKeys';
import { UNATTRIBUTED_PICKS_KEY } from '@/core/state/componentApiPicks';
import projectFileSchema from '@/core/state/config/project-file.schema.json';
import sharedDemoSchema from '@/core/state/config/shared-demo.schema.json';
import {
    PROJECT_FILE_VERSION,
    SHARED_DEMO_FILE_VERSION,
    type ProjectFile,
    type ProjectFileSource,
    type SharedDemoDescription,
} from '@/types/projectFile';
import type { SettingsFile } from '@/types/settingsFile';

export type ReadProjectFileResult =
    | {
          ok: true;
          file: ProjectFile;
          /** Set when the file was an older version and was migrated on read. */
          migratedFrom?: number;
          /** Set when the file's version is newer than this build knows. */
          newerThanSupported?: boolean;
      }
    | { ok: false; error: string };

const NOT_JSON = "This file couldn't be read. It may have been corrupted.";
const NOT_A_PROJECT_FILE = "This doesn't appear to be a Demo Builder project file.";
const NOT_A_DEMO_FILE = "This doesn't appear to be a Demo Builder demo description.";

export type ReadSharedDemoResult =
    | {
          ok: true;
          description: SharedDemoDescription;
          /** Unknown fields and a newer version, in plain words: a warning, never a refusal (D10). */
          warnings: string[];
      }
    | { ok: false; error: string };

/**
 * Parse text as a shared-demo description file (`demo.demo-builder.json`).
 *
 * The file is a colleague's, so it is read tolerantly: a field this build does
 * not know warns and is kept; a newer version warns and is read as far as this
 * build understands it. Only a file that is not JSON, or does not say
 * `kind: 'demo'` with the fields the slice requires, is refused.
 *
 * @param text - The file's contents
 * @returns The description with warnings, or a plain-words refusal
 */
export function readSharedDemoDescription(text: string): ReadSharedDemoResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { ok: false, error: NOT_JSON };
    }
    if (!isSharedDemoDescription(parsed)) {
        return { ok: false, error: NOT_A_DEMO_FILE };
    }
    const warnings: string[] = [];
    const known = new Set(Object.keys(sharedDemoSchema.definitions.SharedDemoDescription.properties));
    const unknown = Object.keys(parsed).filter((key) => !known.has(key));
    if (unknown.length > 0) {
        warnings.push(
            `This demo's description has settings this version of Demo Builder doesn't know: ${unknown.join(', ')}. They were ignored.`,
        );
    }
    if (parsed.version > SHARED_DEMO_FILE_VERSION) {
        warnings.push(
            "This demo's description was written for a newer Demo Builder. What this version understands was used.",
        );
    }
    return { ok: true, description: parsed, warnings };
}

let compiledSharedDemo: ValidateFunction<SharedDemoDescription> | null = null;

/** The generated shared-demo schema is the guard; it is tolerant of unknown fields by design. */
function isSharedDemoDescription(value: unknown): value is SharedDemoDescription {
    if (!compiledSharedDemo) {
        compiledSharedDemo = new Ajv({ allErrors: true, strict: false }).compile<SharedDemoDescription>(
            sharedDemoSchema,
        );
    }
    return isRecord(value) && value.kind === 'demo' && compiledSharedDemo(value);
}

/**
 * Parse text as a project file.
 *
 * @param text - The file's contents
 * @returns The v2 file, or a plain-words refusal
 */
export function readProjectFile(text: string): ReadProjectFileResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { ok: false, error: NOT_JSON };
    }
    if (isProjectFile(parsed)) {
        return {
            ok: true,
            file: withoutCredentials(parsed),
            ...(parsed.version > PROJECT_FILE_VERSION ? { newerThanSupported: true } : {}),
        };
    }
    if (isSettingsFileV1(parsed)) {
        return { ok: true, file: migrateV1(parsed), migratedFrom: 1 };
    }
    return { ok: false, error: NOT_A_PROJECT_FILE };
}

let compiledProjectFile: ValidateFunction<ProjectFile> | null = null;

/**
 * The generated schema (from the `ProjectFile` type) is the guard, so the type
 * narrows without a cast and a shape the type does not have is refused here.
 * `strict: false` for the same reason `manifestValidation.ts` gives: the
 * generated schema is draft-07 with keywords Ajv's strict mode nits.
 */
function isProjectFile(value: unknown): value is ProjectFile {
    if (!compiledProjectFile) {
        compiledProjectFile = new Ajv({ allErrors: true, strict: false }).compile<ProjectFile>(
            projectFileSchema,
        );
    }
    return isRecord(value) && value.kind === 'project' && compiledProjectFile(value);
}

/** The pre-2026-09 export: `version: 1`, no `kind`, and the two maps the migration reads. */
function isSettingsFileV1(value: unknown): value is SettingsFile {
    return (
        isRecord(value) &&
        value.version === 1 &&
        value.kind === undefined &&
        (value.configs === undefined || isRecord(value.configs)) &&
        (value.selections === undefined || isRecord(value.selections))
    );
}

/** The v1 settings file → v2. Total: every v1 field is mapped, dropped on purpose, or stripped. */
function migrateV1(v1: SettingsFile): ProjectFile {
    const source: ProjectFileSource = {
        project: v1.source?.project ?? '',
        extension: v1.source?.extension ?? '',
        ...(v1.edsConfig ? { storefront: storefrontProvenance(v1.edsConfig) } : {}),
    };
    return withoutCredentials({
        kind: 'project',
        version: PROJECT_FILE_VERSION,
        exportedAt: v1.exportedAt,
        source,
        selectedPackage: v1.selectedPackage,
        selectedStack: v1.selectedStack,
        selectedAddons: v1.selectedAddons,
        selectedBlockLibraries: v1.selectedBlockLibraries,
        customBlockLibraries: v1.customBlockLibraries,
        selections: v1.selections,
        configs: v1.configs ?? {},
        adobe: v1.adobe,
        appBuilderComponentSources: v1.appBuilderComponentSources,
        componentApiPicks: foldLegacyPicks(v1.componentApiPicks, v1.additionalConsoleApis),
        // Dropped on purpose (PL-56b): `includesSecrets` (a claim about a field that no
        // longer exists), `installedBlockLibraries` (exported, never read back).
    });
}

/** The source project's repo and site as provenance. A missing repo yields no entry. */
function storefrontProvenance(
    eds: NonNullable<SettingsFile['edsConfig']>,
): NonNullable<ProjectFileSource['storefront']> {
    const githubRepo =
        eds.githubOwner && eds.repoName ? `${eds.githubOwner}/${eds.repoName}` : undefined;
    return {
        ...(githubRepo ? { githubRepo } : {}),
        ...(eds.daLiveOrg ? { daLiveOrg: eds.daLiveOrg } : {}),
        ...(eds.daLiveSite ? { daLiveSite: eds.daLiveSite } : {}),
    };
}

/**
 * The flat legacy picks fold under the unattributed key, the same move
 * `migrateApiPicks` makes for manifests. Attributed picks stay as they are.
 */
function foldLegacyPicks(
    attributed: Record<string, string[]> | undefined,
    flat: string[] | undefined,
): Record<string, string[]> | undefined {
    if (!flat?.length) return attributed;
    const existing = attributed?.[UNATTRIBUTED_PICKS_KEY] ?? [];
    const merged = [...new Set([...existing, ...flat])];
    return { ...(attributed ?? {}), [UNATTRIBUTED_PICKS_KEY]: merged };
}

/** A copy with every registered credential key removed from every component. */
function withoutCredentials(file: ProjectFile): ProjectFile {
    return { ...file, configs: stripSecretValues(file.configs) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
