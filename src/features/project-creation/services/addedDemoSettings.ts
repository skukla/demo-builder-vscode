/**
 * The remembered demos: `demoBuilder.demos.added`, a user-scoped setting in the
 * shape `demoBuilder.blockLibraries.custom` established (read at wizard open,
 * pushed live on change, pruned when an entry disappears). Each entry is an
 * {@link AddedDemo}: the description-file shape plus where it came from.
 *
 * Parsing is tolerant the way the custom-library parser is: an entry that is
 * not a demo row is skipped, never a reason to refuse the rest.
 *
 * @module features/project-creation/services/addedDemoSettings
 */

import * as vscode from 'vscode';
import { readSharedDemoDescription } from '@/core/state/projectFileReader';
import type { AddedDemo, RememberedDemo, SharedDemoDescription, StorefrontKind } from '@/types/projectFile';

/** The setting's key under `demoBuilder`. Cited by name in `SETTING_KEYS` and package.json. */
export const ADDED_DEMOS_SETTING = 'demos.added';

const STOREFRONT_KINDS: ReadonlySet<string> = new Set<StorefrontKind>(['eds', 'headless']);

/** One row per remembered demo, dedupe key: its repository, case-insensitively as GitHub is. */
export function addedDemoKey(demo: Pick<AddedDemo, 'source'>): string {
    return `${demo.source.owner}/${demo.source.repo}`.toLowerCase();
}

/**
 * Read the setting's raw value into rows, skipping anything that is not one.
 *
 * @param raw - The setting's value as VS Code hands it back
 * @returns The valid rows, in the setting's order
 */
export function parseAddedDemoSettings(raw: unknown): RememberedDemo[] {
    if (!Array.isArray(raw)) return [];
    const rows: RememberedDemo[] = [];
    for (const entry of raw) {
        const row = toAddedDemo(entry);
        if (row) rows.push(row);
    }
    return rows;
}

/** A row is a valid description plus a source and a storefront kind. */
function toAddedDemo(entry: unknown): RememberedDemo | undefined {
    if (typeof entry !== 'object' || entry === null) return undefined;
    const candidate = entry as { source?: unknown; storefrontKind?: unknown };
    const source = candidate.source as { owner?: unknown; repo?: unknown; branch?: unknown } | undefined;
    if (!source || typeof source.owner !== 'string' || typeof source.repo !== 'string') return undefined;
    if (typeof candidate.storefrontKind !== 'string' || !STOREFRONT_KINDS.has(candidate.storefrontKind)) {
        return undefined;
    }
    const read = readSharedDemoDescription(JSON.stringify(entry));
    if (!read.ok) return undefined;
    // The description reader keeps fields it does not know, so the zip record is
    // taken off what it answers and put back only when it is exactly `true`.
    const read_: SharedDemoDescription & { createdFromZip?: unknown } = read.description;
    const { createdFromZip: _read, ...description } = read_;
    return {
        ...description,
        source: {
            owner: source.owner,
            repo: source.repo,
            ...(typeof source.branch === 'string' ? { branch: source.branch } : {}),
        },
        storefrontKind: candidate.storefrontKind as StorefrontKind,
        ...((entry as { createdFromZip?: unknown }).createdFromZip === true ? { createdFromZip: true } : {}),
    };
}

/** A demo row with a source and a storefront kind, as the dialog builds it. */
export function isAddedDemo(value: unknown): value is AddedDemo {
    const demo = value as Partial<AddedDemo> | null;
    return (
        typeof demo === 'object' &&
        demo !== null &&
        demo.kind === 'demo' &&
        typeof demo.name === 'string' &&
        typeof demo.source?.owner === 'string' &&
        typeof demo.source.repo === 'string' &&
        (demo.storefrontKind === 'eds' || demo.storefrontKind === 'headless')
    );
}

/** The remembered rows, from the user's settings. */
export function readAddedDemos(): RememberedDemo[] {
    return parseAddedDemoSettings(
        vscode.workspace.getConfiguration('demoBuilder').get<unknown[]>(ADDED_DEMOS_SETTING, []),
    );
}

/**
 * A demo's source moved (GitHub answered with a different repository name):
 * follow it in the remembered setting, silently, the way stored storefront
 * names already self-heal. No-op when the demo is not remembered.
 *
 * @returns Whether a remembered row was updated
 */
export async function renameAddedDemoSource(
    from: { owner: string; repo: string },
    to: { owner: string; repo: string },
): Promise<boolean> {
    const current = readAddedDemos();
    const key = addedDemoKey({ source: from });
    const index = current.findIndex((row) => addedDemoKey(row) === key);
    if (index < 0) return false;
    const next = current.map((row, i) =>
        i === index ? { ...row, source: { ...row.source, owner: to.owner, repo: to.repo } } : row,
    );
    await vscode.workspace
        .getConfiguration('demoBuilder')
        .update(ADDED_DEMOS_SETTING, next, vscode.ConfigurationTarget.Global);
    return true;
}

/**
 * Forget a demo: remove its row from the setting. Projects built on it keep
 * their own row (D2) and are never touched here.
 *
 * @returns The list as it is now remembered
 */
export async function forgetAddedDemo(source: { owner: string; repo: string }): Promise<RememberedDemo[]> {
    const key = addedDemoKey({ source });
    const next = readAddedDemos().filter((row) => addedDemoKey(row) !== key);
    await vscode.workspace
        .getConfiguration('demoBuilder')
        .update(ADDED_DEMOS_SETTING, next, vscode.ConfigurationTarget.Global);
    return next;
}

/**
 * Rename a remembered demo's card and change its description (owner,
 * 2026-09-14). Only these two fields: the source, the kind and what was read
 * stay as they are. A blank description comes off the row. Projects built on
 * the demo keep their own row (D2) and are not touched.
 *
 * @returns The edited row, or undefined when the demo is not remembered
 */
export async function editAddedDemo(
    source: { owner: string; repo: string },
    edit: { name: string; description: string },
): Promise<RememberedDemo | undefined> {
    const current = readAddedDemos();
    const key = addedDemoKey({ source });
    const index = current.findIndex((row) => addedDemoKey(row) === key);
    if (index < 0) return undefined;
    const { description: _previous, ...rest } = current[index];
    const description = edit.description.trim();
    const edited: RememberedDemo = { ...rest, name: edit.name.trim(), ...(description ? { description } : {}) };
    const next = current.map((row, i) => (i === index ? edited : row));
    await vscode.workspace
        .getConfiguration('demoBuilder')
        .update(ADDED_DEMOS_SETTING, next, vscode.ConfigurationTarget.Global);
    return edited;
}

/**
 * Remember a demo in the user's settings. A row for the same repository is
 * replaced in place, so re-adding refreshes what was read without a duplicate card.
 *
 * @param demo - The row to remember
 * @returns The list as it is now remembered
 */
export async function rememberAddedDemo(demo: RememberedDemo): Promise<RememberedDemo[]> {
    const current = readAddedDemos();
    const key = addedDemoKey(demo);
    const index = current.findIndex((row) => addedDemoKey(row) === key);
    const next = index >= 0 ? current.map((row, i) => (i === index ? demo : row)) : [...current, demo];
    await vscode.workspace
        .getConfiguration('demoBuilder')
        .update(ADDED_DEMOS_SETTING, next, vscode.ConfigurationTarget.Global);
    return next;
}
