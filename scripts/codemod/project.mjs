/**
 * The ts-morph harness for this repo — tuned, and carrying the safety rules so no
 * individual codemod has to remember them.
 *
 * WHY THIS EXISTS. On 2026-09-01 four regex-based converters were written and every
 * one of them was wrong, all in the same way: text cannot tell code from a string
 * literal or a comment. The worst deleted ` as never` from inside a detector's own
 * control fixtures, silently disabling the proof that the detector works. ts-morph
 * parses, so that class of damage is structurally impossible — verified on a probe
 * file holding a cast in code, one in a string and one in a comment: two nodes
 * found, both real.
 *
 * TUNED FOR THIS REPO, and the choices are measured rather than copied:
 *
 * - `tsconfig.test.json`, not `tsconfig.json`. It includes BOTH `src*` and `tests*`,
 *   so one project covers everything a codemod here touches. `tsconfig.json`
 *   excludes tests entirely.
 *
 * - Two modes, because the expensive part is optional. `structural` skips loading
 *   the tsconfig's file list and skips dependency resolution — right when the
 *   question is "what shape is this node". `typed` loads the whole program, which
 *   is slow and is the only way to ask the CHECKER anything.
 *
 * - `manipulationSettings` mirrors `.prettierrc`: four spaces, single quotes, LF.
 *   Formatting still gets the last word from prettier — see `formatTouched` — but
 *   emitting near-correct text keeps the diff readable while you review it.
 *
 * @module scripts/codemod/project
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { IndentationText, NewLineKind, Project, QuoteKind } from 'ts-morph';

/**
 * Directories a codemod must never rewrite.
 *
 * `tests/helpers/` is the builders' own home. A converter loose in it rewrites a
 * builder's body into a call to ITSELF, which has happened twice here and takes out
 * a hundred suites with a stack overflow naming none of them.
 *
 * `tests/sop/` holds the enforcers, and their control fixtures are STRINGS
 * containing the very patterns a codemod hunts. ts-morph will not edit a string
 * literal, but an enforcer's real code can still legitimately contain the pattern —
 * and an enforcer quietly rewritten is the one failure with no backstop, because it
 * IS the backstop.
 */
export const NEVER_TOUCH = ['tests/helpers/', 'tests/sop/'];

/** Prettier's settings, so emitted text does not fight the formatter. */
const MANIPULATION = {
    indentationText: IndentationText.FourSpaces,
    quoteKind: QuoteKind.Single,
    newLineKind: NewLineKind.LineFeed,
    useTrailingCommas: false,
};

/**
 * Build a project.
 *
 * @param {object} [opts]
 * @param {'structural'|'typed'} [opts.mode] - `structural` (default) parses only the
 *   files you add and skips dependency resolution: fast, and enough for "what kind
 *   of node is this". `typed` loads the full program so `getType()` and the checker
 *   work — much slower, and the only mode that can answer whether a cast is
 *   load-bearing.
 * @param {string} [opts.tsConfigFilePath]
 * @returns {Project}
 */
export function createProject({ mode = 'structural', tsConfigFilePath = 'tsconfig.test.json' } = {}) {
    if (mode !== 'structural' && mode !== 'typed') {
        throw new Error(`unknown mode "${mode}" — expected "structural" or "typed"`);
    }
    return new Project({
        tsConfigFilePath,
        // In structural mode nothing is added up front; the caller adds exactly the
        // files it means to touch. In typed mode the whole program is needed.
        skipAddingFilesFromTsConfig: mode === 'structural',
        skipFileDependencyResolution: mode === 'structural',
        manipulationSettings: MANIPULATION,
    });
}

/**
 * Add files, dropping the protected directories and SAYING SO.
 *
 * It filters rather than throwing, and the reason is ergonomic rather than a
 * softening: any useful glob — `tests/**\/*.ts` — necessarily sweeps up
 * `tests/helpers` and `tests/sop`, so throwing made the harness unusable for the
 * first real codemod written on it. Intent lives in the glob, not in the accident
 * of what it matched.
 *
 * It is not SILENT filtering, which was the original worry: the excluded paths are
 * printed, and `saveTouched` still refuses outright. Two layers, and the loud one
 * is the convenient one.
 *
 * `readOnly` keeps them in, for a survey that wants to SEE those directories. The
 * danger is writing them, never reading them.
 *
 * @param {Project} project
 * @param {string[]} globs - repo-relative globs, e.g. `['tests/features/**\/*.test.ts']`
 * @param {{ readOnly?: boolean, quiet?: boolean }} [opts]
 * @returns {import('ts-morph').SourceFile[]}
 */
export function addFiles(project, globs, { readOnly = false, quiet = false } = {}) {
    const added = project.addSourceFilesAtPaths(globs);
    if (readOnly) return added;

    // Partition FIRST. `removeSourceFile` forgets the node, so any later
    // `getFilePath()` on a removed file throws "information from a node that was
    // removed or forgotten" — which is what the first version of this did.
    const kept = [];
    const excluded = [];
    for (const f of added) {
        const rel = path.relative(process.cwd(), f.getFilePath());
        (NEVER_TOUCH.some((dir) => rel.startsWith(dir)) ? excluded : kept).push(f);
    }

    for (const f of excluded) project.removeSourceFile(f);

    if (excluded.length > 0 && !quiet) {
        // STDERR, not stdout. `loadbearing-worklist.mjs` prints its report to stdout
        // for the caller to redirect into a markdown file, so a progress line written
        // to stdout lands above the report's own H1 and corrupts the artifact.
        console.error(
            `  excluded ${excluded.length} protected file(s) from writing ` +
                `(${NEVER_TOUCH.join(', ')})`
        );
    }
    return kept;
}

/**
 * Save, then hand the touched paths back so the caller can format and verify them.
 *
 * THE HARD BACKSTOP. This refuses to write a protected file no matter how it got
 * into the project — including through `{ readOnly: true }`, which is exactly the
 * hole that option would otherwise open. A survey that starts reading and ends up
 * editing is the shape that has to be impossible, not merely discouraged.
 *
 * @param {Project} project
 * @param {{ dryRun?: boolean }} [opts] - `dryRun` reports what WOULD change and
 *   writes nothing. Default is a dry run: a codemod should have to ask to write.
 * @returns {string[]} repo-relative paths of the files that differ
 */
export function saveTouched(project, { dryRun = true } = {}) {
    const touched = project
        .getSourceFiles()
        .filter((f) => !f.isSaved())
        .map((f) => path.relative(process.cwd(), f.getFilePath()));

    const forbidden = touched.filter((p) => NEVER_TOUCH.some((dir) => p.startsWith(dir)));
    if (forbidden.length > 0) {
        throw new Error(
            `refusing to WRITE protected files (see NEVER_TOUCH):\n  ${forbidden.join('\n  ')}`
        );
    }

    if (!dryRun) project.saveSync();
    return touched;
}

/**
 * Run prettier over the touched files.
 *
 * ts-morph emits syntactically correct text, not formatted text — it does not know
 * about print width or trailing commas. Skipping this leaves a diff full of
 * reflow noise that hides the actual change, and the next `npm run format` would
 * produce it anyway.
 *
 * @param {string[]} files
 */
export function formatTouched(files) {
    if (files.length === 0) return;
    execFileSync('npx', ['prettier', '--write', ...files], { stdio: 'pipe' });
}
