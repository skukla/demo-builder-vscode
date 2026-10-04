/**
 * What a colleague's App Builder repo says about itself (AB-22 steps 1–2), read
 * from its files after cloning, before anything deploys.
 *
 * Today an import takes its layout, lifecycle, Node version and Console APIs from
 * a catalog entry — and gets one only as an exact copy of it — and nothing reads
 * the inputs its actions take, so an unset one deploys as an empty string without
 * a word (`.rptc/research/integration-import-settings/research.md`). This module
 * is the reading half: it returns facts and decides nothing.
 *
 * The rules, and where each was read (real repos, 2026-10-03):
 *   - layout: `extensions:` at the root of `app.config.yaml` is the App Management
 *     generation, `application:` the standalone one (the two shapes
 *     `AppBuilderComponentCatalogEntry.layout` names);
 *   - lifecycle: an `app.commerce.config.*` file is App Management;
 *   - Node: the major of `engines.node`, else of `.nvmrc` / `.node-version`
 *     (`lts/*` names no major, so none);
 *   - Console APIs: `apis[].code` in `install.yaml` — the names `requiredApis` holds;
 *   - inputs: every `inputs:` value that is exactly `$NAME`, across `$include`d
 *     files (what `aio app deploy` substitutes); `env.dist` / `.env.example` add a
 *     label and a sample, never a name.
 *
 * Read-only and `vscode`-free: the file reader is handed in.
 *
 * @module features/app-builder/services/integrationRepoReader
 */

import * as path from 'path';
import { parse } from 'yaml';

/** Reads a repository-relative file; `undefined` when it is absent. */
export type RepoFileReader = (relativePath: string) => Promise<string | undefined>;

/** One deploy-time input an action takes, with what the env sample says of it. */
export interface DiscoveredInput {
    name: string;
    /** The comment above it in `env.dist` / `.env.example`. */
    label?: string;
    /** Its non-empty value there. A sample, never proof of what the app needs. */
    sample?: string;
}

/** What the repo says, in the catalog entry's own field names where one exists. */
export interface IntegrationRepoFacts {
    hasAppConfig: boolean;
    layout?: 'standalone' | 'extension';
    lifecycle: 'deploy-only' | 'app-management';
    nodeVersion?: string;
    requiredApis: string[];
    /** Sorted by name, each once. */
    inputs: DiscoveredInput[];
}

const APP_CONFIG = 'app.config.yaml';
const COMMERCE_CONFIGS = ['ts', 'js', 'mjs', 'cjs'].map((ext) => `app.commerce.config.${ext}`);
const ENV_SAMPLES = ['env.dist', '.env.example'];
const INPUT_REFERENCE = /^\$([A-Za-z_][A-Za-z0-9_]*)$/;
/** Includes are followed this deep; real repos use two levels. */
const MAX_INCLUDE_DEPTH = 8;

/**
 * Read the repo.
 *
 * @param read - repository-relative file reader
 * @returns the facts, each absent-tolerant
 */
export async function readIntegrationRepo(read: RepoFileReader): Promise<IntegrationRepoFacts> {
    const appConfigText = await read(APP_CONFIG);
    const appConfig = parseYaml(appConfigText);
    const lifecycle = (await anyExists(read, COMMERCE_CONFIGS)) ? 'app-management' : 'deploy-only';
    const nodeVersion = await nodeMajorOf(read);
    const requiredApis = apisOf(parseYaml(await read('install.yaml')));
    const names = appConfigText === undefined ? new Set<string>() : await inputNames(read, APP_CONFIG);
    const samples = await envSamples(read);
    const inputs = [...names].sort().map((name) => ({ name, ...samples.get(name) }));
    return {
        hasAppConfig: appConfigText !== undefined,
        ...(layoutOf(appConfig) ? { layout: layoutOf(appConfig) } : {}),
        lifecycle,
        ...(nodeVersion ? { nodeVersion } : {}),
        requiredApis,
        inputs,
    };
}

function parseYaml(text: string | undefined): unknown {
    if (text === undefined) return undefined;
    try {
        return parse(text);
    } catch {
        return undefined;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function layoutOf(appConfig: unknown): IntegrationRepoFacts['layout'] {
    if (!isRecord(appConfig)) return undefined;
    if ('extensions' in appConfig) return 'extension';
    if ('application' in appConfig) return 'standalone';
    return undefined;
}

async function anyExists(read: RepoFileReader, paths: string[]): Promise<boolean> {
    for (const candidate of paths) {
        if ((await read(candidate)) !== undefined) return true;
    }
    return false;
}

/** The first number in a version range or pin (`^24.0.0`, `v22.11.0`, `>=20`). */
function majorOf(version: string | undefined): string | undefined {
    return version?.match(/(\d+)/)?.[1];
}

async function nodeMajorOf(read: RepoFileReader): Promise<string | undefined> {
    const pkg = parseJson(await read('package.json'));
    const engines = isRecord(pkg) && isRecord(pkg.engines) ? pkg.engines.node : undefined;
    const fromEngines = typeof engines === 'string' ? majorOf(engines) : undefined;
    if (fromEngines) return fromEngines;
    for (const file of ['.nvmrc', '.node-version']) {
        const major = majorOf((await read(file))?.trim());
        if (major) return major;
    }
    return undefined;
}

function parseJson(text: string | undefined): unknown {
    if (text === undefined) return undefined;
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

function apisOf(install: unknown): string[] {
    if (!isRecord(install) || !Array.isArray(install.apis)) return [];
    return install.apis
        .map((api) => (isRecord(api) ? api.code : undefined))
        .filter((code): code is string => typeof code === 'string' && code.length > 0);
}

/**
 * Every `$NAME` an `inputs:` block names, in this file and every file it
 * `$include`s (relative to the including file). A missing or malformed file adds
 * nothing; a path climbing out of the repo is never read; each file is read once.
 */
async function inputNames(read: RepoFileReader, entry: string): Promise<Set<string>> {
    const names = new Set<string>();
    const seen = new Set<string>();
    const visit = async (file: string, depth: number): Promise<void> => {
        if (seen.has(file) || depth > MAX_INCLUDE_DEPTH) return;
        seen.add(file);
        const includes: string[] = [];
        collect(parseYaml(await read(file)), names, includes);
        for (const include of includes) {
            const target = insideRepo(path.posix.join(path.posix.dirname(file), include));
            if (target) await visit(target, depth + 1);
        }
    };
    await visit(entry, 0);
    return names;
}

/** A normalised repo-relative path, or undefined when it leaves the repo. */
function insideRepo(joined: string): string | undefined {
    const normal = path.posix.normalize(joined);
    if (normal.startsWith('../') || normal === '..' || path.posix.isAbsolute(normal)) return undefined;
    return normal;
}

function collect(node: unknown, names: Set<string>, includes: string[]): void {
    if (Array.isArray(node)) {
        node.forEach((item) => collect(item, names, includes));
        return;
    }
    if (!isRecord(node)) return;
    for (const [key, value] of Object.entries(node)) {
        if (key === '$include' && typeof value === 'string') includes.push(value);
        else if (key === 'inputs' && isRecord(value)) addReferences(value, names);
        else collect(value, names, includes);
    }
}

function addReferences(inputs: Record<string, unknown>, names: Set<string>): void {
    for (const value of Object.values(inputs)) {
        const match = typeof value === 'string' ? INPUT_REFERENCE.exec(value.trim()) : null;
        if (match) names.add(match[1]);
    }
}

/** Labels and samples by name, from the first env sample file the repo has. */
async function envSamples(read: RepoFileReader): Promise<Map<string, Omit<DiscoveredInput, 'name'>>> {
    for (const file of ENV_SAMPLES) {
        const text = await read(file);
        if (text !== undefined) return parseEnvSample(text);
    }
    return new Map();
}

function parseEnvSample(text: string): Map<string, Omit<DiscoveredInput, 'name'>> {
    const out = new Map<string, Omit<DiscoveredInput, 'name'>>();
    let comment: string[] = [];
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (line.startsWith('#')) {
            comment.push(line.replace(/^#+\s*/, ''));
            continue;
        }
        const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
        if (match) {
            const label = comment.join(' ').trim();
            const sample = match[2].trim();
            out.set(match[1], { ...(label ? { label } : {}), ...(sample ? { sample } : {}) });
        }
        comment = [];
    }
    return out;
}
