/**
 * Report to Demo Builder: a GitHub issue an SC's AI drafts when it finds the cause of a failure in
 * Demo Builder itself (owner, 2026-11-19, after an AI fixed the updater from an SC's chat). The
 * SC's AI never changes Demo Builder's code and never posts: the draft opens on GitHub's new-issue
 * page, and the SC reads it and presses Submit. A pull request was considered and declined: the
 * repository is public, an SC cannot build or test a change, and a fork and push would be a write
 * on their behalf.
 *
 * The repository is PUBLIC, so the draft carries nothing from the demo: every text value in every
 * project's manifest is replaced (names, repositories, sites, codes, settings), then web addresses,
 * emails, tokens and file paths. The SC reads the draft on GitHub before submitting it. What is left is what failed, the AI's diagnosis, the
 * error's shape and the version.
 *
 * Pure: the tool (`reportIssueTool.ts`) gathers the names and opens the page.
 *
 * @module features/ai/server/demoBuilderIssue
 */

import * as path from 'path';
import manifestSchema from '@/core/state/config/manifest.schema.json';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { sanitizeErrorForLogging } from '@/core/validation/SensitiveDataRedactor';
import appBuilderCatalog from '@/features/components/config/app-builder-components.json';
import blockLibraries from '@/features/components/config/block-libraries.json';
import componentsCatalog from '@/features/components/config/components.json';
import stacks from '@/features/components/config/stacks.json';
import { loadDemoPackages } from '@/features/components/services/demoPackageLoader';
import type { Project } from '@/types/base';

/** Where Demo Builder's issues are filed. Public. */
export const ISSUES_NEW_URL = 'https://github.com/skukla/demo-builder-vscode/issues/new';

/** Room for the body in the link: GitHub refuses a URL much past 8,000 characters. */
const MAX_BODY = 5000;

/** What the SC's AI found, in its words. */
export interface IssueDraft {
    title: string;
    whatFailed: string;
    diagnosis: string;
    errorText?: string;
}

const URL = /\bhttps?:\/\/[^\s)>\]]+/giu;
const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gu;

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * The text with every demo detail taken out: the names given, longest first so a repository
 * "owner/acme" goes before "acme"; then addresses, emails, tokens and paths.
 *
 * @param known - names, folders, repositories and codes from the SC's projects
 */
export function redactForIssue(text: string, known: readonly string[]): string {
    const names = [
        ...new Set(known.map((name) => name.trim()).filter((name) => name.length >= 3)),
    ].sort((a, b) => b.length - a.length);
    let out = text;
    // Whole words only: hiding "main" must not blank "maintain".
    for (const name of names) out = out.replace(new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`, 'giu'), '<name>');
    out = out.replace(URL, '<url>').replace(EMAIL, '<email>');
    return sanitizeErrorForLogging(out);
}

/** The issue's body: what failed, what the AI found, the error, the version; cut short to fit a link. */
export function issueBody(draft: IssueDraft, version: string, known: readonly string[]): string {
    const lines = [
        '**What failed**',
        redactForIssue(draft.whatFailed, known),
        '',
        "**What the SC's AI found**",
        redactForIssue(draft.diagnosis, known),
        ...(draft.errorText
            ? ['', '**The error**', '```', redactForIssue(draft.errorText, known), '```']
            : []),
        '',
        `Demo Builder version: ${version}`,
        '',
        "_Drafted by an SC's AI through Demo Builder. Names, addresses and codes from the demo were " +
            'replaced before it opened._',
    ];
    const body = lines.join('\n');
    return body.length > MAX_BODY ? `${body.slice(0, MAX_BODY)}\n\n(cut short)` : body;
}

/** GitHub's new-issue page with the draft filled in. */
export function issueUrl(draft: IssueDraft, version: string, known: readonly string[]): string {
    const title = redactForIssue(draft.title, known).slice(0, 200);
    const body = issueBody(draft, version, known);
    return `${ISSUES_NEW_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

/** Every text value anywhere in a manifest or a catalog, however deep. */
function textsIn(value: unknown, seen = new Set<unknown>()): string[] {
    if (typeof value === 'string') return [value];
    if (value === null || typeof value !== 'object' || seen.has(value)) return [];
    seen.add(value);
    return Object.values(value).flatMap((child) => textsIn(child, seen));
}

/**
 * Demo Builder's own public words: every value in the files it ships, so none of them is a demo's
 * secret. The manifest schema gives every state a project can be in ("deployed", "ready"); the
 * catalogs give components, stacks, demo packages and block libraries. Read from the files, not
 * listed here: a word they gain is left visible without a change.
 */
export async function publicWords(): Promise<ReadonlySet<string>> {
    const packages = await loadDemoPackages();
    const sources = [manifestSchema, componentsCatalog, appBuilderCatalog, blockLibraries, stacks, packages];
    return new Set(textsIn(sources).map((word) => word.toLowerCase()));
}

/** Versions and dates: public shapes, kept so a report can say which build and when. */
const PUBLIC_SHAPE = /^v?\d+(\.\d+)+(-[\w.]+)?$|^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/u;

/**
 * Whether a manifest value must be hidden. Hidden by default: a value is kept only when it is too
 * short or a switch to matter, Demo Builder's own public word, or a version or a date. A value
 * nothing knows is hidden, never leaked (owner, 2026-11-19: no hardcoded list of what to hide).
 */
function mustHide(value: string, known: ReadonlySet<string>): boolean {
    const word = value.trim();
    if (word.length < 4 || /^(true|false|null|undefined)$/iu.test(word)) return false;
    return !known.has(word.toLowerCase()) && !PUBLIC_SHAPE.test(word);
}

/**
 * Every demo detail a draft must not carry, read from the SC's projects as they are on disk: EVERY
 * text value in each manifest (names, folders, repositories, sites, store codes, settings, whatever a
 * later version adds), not a chosen list of fields, less Demo Builder's own public words. A
 * repository is also split into its owner and name.
 */
export function knownNamesOf(projects: readonly Project[], publicSet: ReadonlySet<string>): string[] {
    return projects.flatMap((project) => {
        const values = [...textsIn(project), getProjectDisplayName(project), path.basename(project.path ?? '')];
        const parts = values.flatMap((value) => (/^[\w.-]+\/[\w.-]+$/u.test(value) ? value.split('/') : []));
        return [...values, ...parts].filter((value) => mustHide(value, publicSet));
    });
}
