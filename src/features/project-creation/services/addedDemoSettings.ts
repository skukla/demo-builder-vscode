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
import type { AddedDemo, StorefrontKind } from '@/types/projectFile';

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
export function parseAddedDemoSettings(raw: unknown): AddedDemo[] {
    if (!Array.isArray(raw)) return [];
    const rows: AddedDemo[] = [];
    for (const entry of raw) {
        const row = toAddedDemo(entry);
        if (row) rows.push(row);
    }
    return rows;
}

/** A row is a valid description plus a source and a storefront kind. */
function toAddedDemo(entry: unknown): AddedDemo | undefined {
    if (typeof entry !== 'object' || entry === null) return undefined;
    const candidate = entry as { source?: unknown; storefrontKind?: unknown };
    const source = candidate.source as { owner?: unknown; repo?: unknown; branch?: unknown } | undefined;
    if (!source || typeof source.owner !== 'string' || typeof source.repo !== 'string') return undefined;
    if (typeof candidate.storefrontKind !== 'string' || !STOREFRONT_KINDS.has(candidate.storefrontKind)) {
        return undefined;
    }
    const read = readSharedDemoDescription(JSON.stringify(entry));
    if (!read.ok) return undefined;
    return {
        ...read.description,
        source: {
            owner: source.owner,
            repo: source.repo,
            ...(typeof source.branch === 'string' ? { branch: source.branch } : {}),
        },
        storefrontKind: candidate.storefrontKind as StorefrontKind,
    };
}

/** The remembered rows, from the user's settings. */
export function readAddedDemos(): AddedDemo[] {
    return parseAddedDemoSettings(
        vscode.workspace.getConfiguration('demoBuilder').get<unknown[]>(ADDED_DEMOS_SETTING, []),
    );
}

/**
 * Remember a demo in the user's settings. A row for the same repository is
 * replaced in place, so re-adding refreshes what was read without a duplicate card.
 *
 * @param demo - The row to remember
 * @returns The list as it is now remembered
 */
export async function rememberAddedDemo(demo: AddedDemo): Promise<AddedDemo[]> {
    const current = readAddedDemos();
    const key = addedDemoKey(demo);
    const index = current.findIndex((row) => addedDemoKey(row) === key);
    const next = index >= 0 ? current.map((row, i) => (i === index ? demo : row)) : [...current, demo];
    await vscode.workspace
        .getConfiguration('demoBuilder')
        .update(ADDED_DEMOS_SETTING, next, vscode.ConfigurationTarget.Global);
    return next;
}
