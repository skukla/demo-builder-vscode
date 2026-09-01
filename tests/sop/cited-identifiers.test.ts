/**
 * SOP Compliance Test: an identifier a current-tense document names must EXIST.
 *
 * The enforced half of "never publish an identifier you have not read from the
 * source". Its sibling `doc-module-refs.test.ts` covers file paths; this covers
 * `demoBuilder.*` — settings, commands and view ids, the names a user is told to
 * type or click.
 *
 * WHAT IT FOUND ON ITS FIRST RUN, which is the argument for it existing:
 *
 *   README.md documented `demoBuilder.ai.surface` and `demoBuilder.ai.dockToRight`
 *   — with a two-row behaviour table and an "Extension surface" walkthrough — for
 *   months after commit 7bbe1bd9e removed both settings AND the surface itself.
 *   Users were being told to configure something that does not exist.
 *
 *   The rule this suite enforces had broken its own rule. Both CLAUDE.md and the
 *   handbook said "the real key is `demoBuilder.daLive.defaultOrg`" in the present
 *   tense, correcting one dead identifier with another: that setting was dropped in
 *   6e14114b9 when the DA.live org became a GitHub-namespace picker with no setting.
 *
 * WHY THE GENRE FILTER MATTERS. A CHANGELOG entry recording a removal must name
 * the removed thing, and a research doc records what was true when written. Those
 * genres are excluded exactly as `doc-module-refs` excludes them — a broken
 * reference in a historical record is not rot, it is the record.
 *
 * A current-tense document that deliberately discusses a removed identifier goes
 * in the ledger with its reason.
 *
 * @see .rptc/backlog/2026-08-31-every-convention-enforced.md
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');

/** Genres that RECORD rather than describe. Same list as doc-module-refs. */
const HISTORICAL = ['docs/research/', 'docs/architecture/adr/', '.rptc/', 'CHANGELOG'];

/**
 * Current-tense documents that name a removed identifier ON PURPOSE.
 * Shrink-only: a row whose identifier comes back, or whose file stops naming it,
 * fails just as loudly as a new violation.
 */
const DELIBERATE: Record<string, string> = {
    // Both of these name a script in ANOTHER project's package.json, which is the
    // one shape this check cannot infer: `npm run` is the same text whether the
    // reader is standing in this repo or in a demo project it generated.
    '.claude/skills/debug-log-triage/SKILL.md  npm run build':
        "a COMPONENT's build script, quoted in the row that explains the failure log it emits — not a script of this repo",
    'src/features/project-creation/templates/skills/add-component.md  npm run dev':
        "a template SHIPPED INTO a generated project; it describes that project's package.json, never this one",
    'docs/systems/mcp-server.md  demoBuilder.ai.dryRun':
        'under a heading that reads "The dry run — REMOVED 2026-08-26"; the section exists to say it is gone',
    'CLAUDE.md  demoBuilder.eds.defaultDaLiveOrg':
        'the WRONG key from the 2026-08-16 incident, quoted as the thing that was wrong',
    'CLAUDE.md  demoBuilder.daLive.defaultOrg':
        'the key that incident should have named; itself dropped in 6e14114b9, which the paragraph now says',
    'docs/development/handbook.md  demoBuilder.eds.defaultDaLiveOrg':
        'same incident, quoted as the wrong key',
    'docs/development/handbook.md  demoBuilder.daLive.defaultOrg':
        'same incident, quoted as the key it should have named and since removed',
    'README.md  demoBuilder.ai.surface':
        'named in the note recording that it was REMOVED in 7bbe1bd9e',
    'README.md  demoBuilder.ai.dockToRight': 'named in the same removal note',
};

function declaredIdentifiers(): Set<string> {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const out = new Set<string>();
    const cfg = pkg.contributes?.configuration;
    for (const block of Array.isArray(cfg) ? cfg : [cfg]) {
        for (const key of Object.keys(block?.properties ?? {})) out.add(key);
    }
    for (const c of pkg.contributes?.commands ?? []) out.add(c.command);
    for (const v of Object.values(pkg.contributes?.views ?? {}) as { id: string }[][]) {
        for (const view of v) out.add(view.id);
    }
    return out;
}

/**
 * Read a corpus file, or return empty if it vanished between the listing and the
 * read.
 *
 * Jest runs suites in parallel, and another suite may create and delete a temporary
 * file inside `tests/` while this one is walking it. `collectTestFiles` already
 * tolerates that for DIRECTORIES and says so in a comment; the READS were left
 * unguarded, and on 2026-09-01 that became a real ENOENT failure the moment a new
 * suite started writing a probe file.
 *
 * Empty is the right answer, not a throw: this counts COMMITTED files, and a file
 * that no longer exists is not one. The assertions are exact-equality against a
 * pinned number, so a genuinely missing corpus file fails the count rather than
 * slipping through.
 */
function readOrEmpty(rel: string): string {
    try {
        return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    } catch {
        return '';
    }
}

function walk(dir: string, ext: string): string[] {
    const out: string[] = [];
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const e of entries) {
        if (e.name === 'node_modules') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(full, ext));
        else if (e.name.endsWith(ext)) out.push(path.relative(repoRoot, full).replace(/\\/g, '/'));
    }
    return out;
}

/**
 * An identifier registered in code counts as existing, even if package.json omits
 * it — many command and view ids are registered at runtime.
 *
 * COMMENTS ARE STRIPPED FIRST, and that is not cosmetic. The first draft matched
 * any backticked `demoBuilder.*`, so two source comments saying the code no longer
 * watches `demoBuilder.ai.surface` made the retired setting look registered — the
 * check would then have declared README's stale documentation of it perfectly
 * fine. A mention is not a registration. The ledger caught it.
 */
function registeredInSource(): Set<string> {
    const out = new Set<string>();
    for (const f of walk(path.join(repoRoot, 'src'), '.ts').concat(
        walk(path.join(repoRoot, 'src'), '.tsx')
    )) {
        const body = fs
            .readFileSync(path.join(repoRoot, f), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');
        for (const m of body.matchAll(/['"`](demoBuilder\.[A-Za-z0-9_.]+)['"`]/g)) out.add(m[1]);
    }
    return out;
}

const declared = declaredIdentifiers();
const inSource = registeredInSource();

const currentTenseDocs = [
    'README.md',
    'CLAUDE.md',
    'CONTRIBUTING.md',
    ...walk(path.join(repoRoot, 'docs'), '.md'),
    ...walk(path.join(repoRoot, 'src'), '.md'),
    ...walk(path.join(repoRoot, '.claude'), '.md'),
].filter((f) => !HISTORICAL.some((h) => f.includes(h)));

describe('identifiers named by current-tense documents exist', () => {
    it('CONTROL: the corpus and both registries were actually read', () => {
        expect(currentTenseDocs.length).toBeGreaterThan(20);
        expect(declared.size).toBeGreaterThan(20);
        expect(inSource.size).toBeGreaterThan(10);
        // and the genre filter really excludes the records
        expect(currentTenseDocs.some((f) => f.includes('CHANGELOG'))).toBe(false);
        expect(currentTenseDocs.some((f) => f.includes('docs/research/'))).toBe(false);
    });

    it('every demoBuilder.* identifier a current-tense document names is real', () => {
        const offenders: string[] = [];
        for (const f of currentTenseDocs) {
            const body = readOrEmpty(f);
            for (const m of body.matchAll(/\bdemoBuilder\.[A-Za-z0-9_.]+/g)) {
                const id = m[0].replace(/\.$/, '');
                if (declared.has(id) || inSource.has(id)) continue;
                const row = `${f}  ${id}`;
                if (row in DELIBERATE) continue;
                offenders.push(row);
            }
        }
        expect([...new Set(offenders)].sort()).toEqual([]);
    });

    /**
     * The same rule, aimed at the identifier a reader is most likely to TYPE.
     *
     * `npm run <name>` is an instruction, not a description: a doc naming a script
     * that does not exist wastes the reader's time and reads as a repo that has
     * drifted. It is the same defect as a dead setting name, and until 2026-09-01
     * nothing checked it — the toolchain page alone names seventeen.
     *
     * Scripts are enumerable from package.json, so this needs no ledger. A doc
     * that must mention a REMOVED script is already excluded by the genre filter.
     */
    it('every `npm run` a current-tense document names is a real script', () => {
        const scripts = new Set(
            Object.keys(
                (
                    JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
                        scripts: Record<string, string>;
                    }
                ).scripts
            )
        );
        // A zero here would make the assertion below vacuous.
        expect(scripts.size).toBeGreaterThan(20);

        const offenders: string[] = [];
        for (const f of currentTenseDocs) {
            const body = readOrEmpty(f);
            for (const m of body.matchAll(/\bnpm run ([a-z0-9][a-z0-9:_-]*)/g)) {
                const row = `${f}  npm run ${m[1]}`;
                if (scripts.has(m[1]) || row in DELIBERATE) continue;
                offenders.push(row);
            }
        }
        expect([...new Set(offenders)].sort()).toEqual([]);
    });

    it('every deliberate-mention row still applies, and states a reason', () => {
        const stale: string[] = [];
        for (const row of Object.keys(DELIBERATE)) {
            const [f, id] = row.split(/\s{2,}/);
            const abs = path.join(repoRoot, f);
            if (!fs.existsSync(abs)) {
                stale.push(row);
                continue;
            }
            const body = fs.readFileSync(abs, 'utf8');
            // stale if the file stopped naming it, or the identifier came back
            if (!body.includes(id) || declared.has(id) || inSource.has(id)) stale.push(row);
        }
        const unreasoned = Object.entries(DELIBERATE)
            .filter(([, why]) => !why || !why.trim())
            .map(([k]) => k);
        expect({ stale_deleteWithTheFix: stale, unreasoned }).toEqual({
            stale_deleteWithTheFix: [],
            unreasoned: [],
        });
    });
});
