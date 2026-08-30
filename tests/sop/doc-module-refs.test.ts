/**
 * Every module path a current-tense document cites must resolve.
 *
 * WHY THIS EXISTS, from a measurement rather than a worry. The 2026-08-30
 * documentation audit found 50 dead module references across the docs: four
 * feature READMEs citing `@/services/serviceLocator` (the alias resolves to
 * `src/services/`, which holds no such file — it is `@/core/di`), five READMEs
 * whose code examples imported from feature barrels the barrel work had deleted,
 * and two files documenting a `src/core/errors/` directory that no longer exists.
 * Thirty-seven of the fifty were `import` lines in examples a reader would copy.
 *
 * None of it was anyone's carelessness. A module path inside a markdown file is
 * invisible to tsc, to eslint and to every test — so a rename is silently correct
 * in the code and silently wrong in the eight documents that named the old path.
 * This is the check that makes a rename fail loudly instead.
 *
 * WHAT THIS CANNOT DO: it proves the path RESOLVES, not that the prose around it
 * is still true. A README can cite a live module and describe it wrongly, and this
 * suite will pass. Judging that is a release-cut job (`.claude/skills/codebase-sweep`).
 */
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';

const ROOT = join(__dirname, '..', '..');

/** From tsconfig.json `paths`. Kept literal so a change to either fails the pin below. */
const ALIASES: Record<string, string> = {
    '@/commands/': 'src/commands/',
    '@/core/': 'src/core/',
    '@/features/': 'src/features/',
    '@/services/': 'src/services/',
    '@/providers/': 'src/providers/',
    '@/utils/': 'src/utils/',
    '@/types/': 'src/types/',
};
const EXACT: Record<string, string> = {
    '@/mcp-server': 'src/mcp-server',
    '@/types': 'src/types',
};

/**
 * Genres excluded, each for a stated reason — a broken reference in a HISTORICAL
 * document is correct, not rot.
 *   docs/research  — dated findings; they describe the code as it was that day
 *   docs/architecture/adr — a superseded ADR legitimately names deleted code
 *   .rptc          — in-flight work tracking, not documentation
 */
const EXCLUDED = ['docs/research/', 'docs/architecture/adr/', '.rptc/', 'CHANGELOG'];

/**
 * Deliberate non-paths, each with the reason it is not a citation. A path that
 * merely went stale does NOT belong here — fix the document instead.
 */
const ALLOWED: Record<string, string> = {
    'CLAUDE.md::.rptc/prompt.md':
        'gitignored by design, and the sentence citing it says so — it is named as the one exception to .rptc being tracked, so it must not resolve',
    '.claude/skills/spectrum-webview-ui/SKILL.md::docs/development/ui-patterns.md':
        'names the document this skill ABSORBED on 2026-08-30, so the reader knows where 585 lines went. It must not resolve — that is the fact being recorded.',
    '.claude/skills/gate/SKILL.md::tests/oversized.test.ts':
        'invented filename in a worked example of the file-size check — the point is that it is over the limit, so it must not exist',
    '.claude/skills/gate/SKILL.md::tests/subdir/test.test.ts':
        'invented filename showing how the scan walks nested directories',
    '.claude/skills/rptc-hygiene-scan/SKILL.md::src/a/foo.ts':
        'invented path in an example of a citation the scan flags as dead',
    '.claude/skills/rptc-hygiene-scan/SKILL.md::src/features/x/old.ts':
        'invented path in the same example — a file that was deleted is the case being shown',
};

function docs(): string[] {
    return execSync("git ls-files '*.md'", { encoding: 'utf8', cwd: ROOT })
        .trim()
        .split('\n')
        .filter((f) => !EXCLUDED.some((x) => f.includes(x)));
}

function toDisk(spec: string): string | null {
    if (EXACT[spec]) return EXACT[spec];
    for (const [alias, real] of Object.entries(ALIASES)) {
        if (spec.startsWith(alias)) return real + spec.slice(alias.length);
    }
    return null; // not an alias this repo owns
}

/** A cited LOCATION may be a file or a directory. */
function citationResolves(spec: string): boolean | null {
    const p = toDisk(spec);
    if (p === null) return null;
    return ['', '.ts', '.tsx', '.json'].some((ext) => existsSync(join(ROOT, p + ext)));
}

/** An IMPORT specifier must reach a file, or a directory carrying an index. */
function importResolves(spec: string): boolean | null {
    const p = toDisk(spec);
    if (p === null) return null;
    return ['.ts', '.tsx', '.json', '/index.ts', '/index.tsx'].some((ext) =>
        existsSync(join(ROOT, p + ext))
    );
}

/** Ellipses are prose (`@/features/.../Thing`), never a path. */
const isPlaceholder = (s: string) => s.includes('...');

function citations(md: string): string[] {
    return [...md.matchAll(/`(@\/[\w@./-]+)`/g)].map((m) => m[1]).filter((s) => !isPlaceholder(s));
}

/**
 * `from '...'` also appears inside SHELL examples — a `grep -rn "from '@/features/...'"`
 * is documentation of a search, not an import. Requiring the line to START with
 * import/export excludes those; the leading-anchor was already there, but a grep
 * nested inside a multi-line match could still be captured by the 200-char window.
 */
function imports(md: string): string[] {
    return (
        [...md.matchAll(/^\s*(?:import|export)[\s\S]{0,200}?from '(@\/[^']+)'/gm)]
            .map((m) => m[1])
            .filter((s) => !isPlaceholder(s))
            // A capture containing a regex metacharacter came from a search pattern.
            .filter((s) => !/[[\]^*$()|]/.test(s))
    );
}

/**
 * A REPO path written in backticks, not as a markdown link.
 *
 * Docs cite files both ways, and only the link form was checked. The validation
 * README carried two dead ones for that reason — `docs/security/validation.md` and
 * `src/core/command-execution/README.md`, neither of which exists — sitting in a
 * "See Also" list in backticks, invisible to a checker that only read `](...)`.
 *
 * Restricted to paths that name a FILE with an extension. A bare directory in
 * backticks is usually prose ("everything under `src/features/`"), and a trailing
 * slash or a `{placeholder}` segment is a shape rather than a path.
 *
 * Scoped to src/, docs/ and tests/ ON PURPOSE. This extension GENERATES projects,
 * and their documentation cites paths inside the generated project — `.claude/mcp.json`,
 * a storefront's `scripts/delayed.js`. Those are correct references to files that do
 * not exist HERE, and flagging them would train people to ignore this check.
 */
function backtickedPaths(md: string): string[] {
    const out = [...md.matchAll(/`((?:src|docs|tests)\/[\w./-]+\.\w+)`/g)]
        .map((m) => m[1])
        .filter((s) => !s.includes('{') && !s.includes('...'));
    return [...new Set(out)];
}

function scan(pick: (md: string) => string[], resolve: (s: string) => boolean | null) {
    const bad: string[] = [];
    for (const f of docs()) {
        for (const spec of pick(readFileSync(join(ROOT, f), 'utf8'))) {
            if (resolve(spec) === false && !ALLOWED[`${f}::${spec}`]) bad.push(`${f}  ${spec}`);
        }
    }
    return [...new Set(bad)].sort();
}

/**
 * References resolved against the CITING file's own directory.
 *
 * The checks above are scoped to paths beginning `src/`, `docs/` or `tests/`, so
 * a relative reference is invisible to all of them — and a relative reference is
 * the form a per-directory CLAUDE.md reaches for most. Three dead ones survived in
 * `src/commands/CLAUDE.md` with this whole suite green: `../webviews/CLAUDE.md`
 * (there is no `src/webviews/` at all), `../utils/CLAUDE.md`, and
 * `handlers/HandlerContext.ts` in a directory that is empty.
 *
 * Two forms, deliberately treated differently:
 *
 *   ./x, ../x   always checked. An explicit relative path is unambiguously about
 *               THIS repo, so a miss is always rot.
 *   dir/file    checked only when the resolved PARENT directory exists here. This
 *               preserves the exclusion the suite already states: the extension
 *               generates projects, and documentation legitimately cites paths
 *               inside them (`.claude/mcp.json`) that must not be flagged. No
 *               `.claude/` sits beside `src/features/`, so those stay quiet, while
 *               `handlers/` does sit beside `src/commands/`, so that one is caught.
 */
function relativeRefs(md: string): string[] {
    const out = [
        ...[...md.matchAll(/`([\w.@-]+(?:\/[\w.@-]+)+\.\w+)`/g)].map((m) => m[1]),
        ...[...md.matchAll(/\]\(((?:\.\.?\/)[^)#\s]+)\)/g)].map((m) => m[1]),
    ].filter(
        (s) =>
            s.includes('/') &&
            !s.startsWith('src/') &&
            !s.startsWith('docs/') &&
            !s.startsWith('tests/') &&
            !s.includes('://') &&
            !s.includes('{') &&
            !s.includes('*') &&
            !s.includes('...')
    );
    return [...new Set(out)];
}

describe('the architecture index lists every architecture document', () => {
    // The other direction from a link check. Links resolving proves nothing about
    // a document that was never listed — and `where-code-goes.md` was exactly that:
    // present on disk, cited by ADR-015 and by the root CLAUDE.md for placement
    // rules, and absent from the index that exists to find it.
    //
    // The ADR half of that same file was converted to a generated index after it
    // drifted, stopping at ADR-018 while four more had landed. The doc list was
    // starting the same way, so it gets a check instead of a generator: twelve
    // entries do not need a build step, they need something that notices.
    const INDEX = join(ROOT, 'docs/architecture/CLAUDE.md');

    const topLevelDocs = (): string[] =>
        execSync("git ls-files 'docs/architecture/*.md'", { encoding: 'utf8', cwd: ROOT })
            .split('\n')
            .filter((f) => f.endsWith('.md') && f.split('/').length === 3)
            .map((f) => f.split('/').pop() as string)
            .filter((f) => f !== 'CLAUDE.md');

    it('CONTROL: the walk finds architecture documents', () => {
        expect(topLevelDocs().length).toBeGreaterThan(5);
    });

    it('names every top-level document in docs/architecture/', () => {
        // ADRs live in adr/ and are delegated to their own GENERATED index, so they
        // are deliberately out of scope here.
        const index = readFileSync(INDEX, 'utf8');
        const missing = topLevelDocs().filter((d) => !index.includes(d));
        expect(missing).toEqual([]);
    });
});

describe('relative references resolve against the file that makes them', () => {
    const findings = (): string[] => {
        const bad: string[] = [];
        for (const f of docs()) {
            const dir = dirname(f);
            for (const spec of relativeRefs(readFileSync(join(ROOT, f), 'utf8'))) {
                const target = join(ROOT, dir, spec);
                const explicit = spec.startsWith('./') || spec.startsWith('../');
                if (!explicit && !existsSync(dirname(target))) continue;
                if (!existsSync(target) && !ALLOWED[`${f}::${spec}`]) bad.push(`${f}  ${spec}`);
            }
        }
        return [...new Set(bad)].sort();
    };

    it('CONTROL: the extractor finds relative references to check', () => {
        const n = docs().reduce(
            (acc, f) => acc + relativeRefs(readFileSync(join(ROOT, f), 'utf8')).length,
            0
        );
        expect(n).toBeGreaterThan(20);
    });

    it('CONTROL: a path known to be absent is reported', () => {
        // Proves the resolver actually tests the filesystem rather than passing blind.
        expect(existsSync(join(ROOT, 'src/commands/handlers/HandlerContext.ts'))).toBe(false);
    });

    it('every relative reference names a file that exists', () => {
        expect(findings()).toEqual([]);
    });
});

describe('module paths cited by current-tense documents resolve', () => {
    it('CONTROL: the scan reads real documents and finds real candidates', () => {
        // Without this, every assertion below passes vacuously on an empty file list.
        expect(docs().length).toBeGreaterThan(50);
        const found = docs().flatMap((f) => citations(readFileSync(join(ROOT, f), 'utf8')));
        // Guards against the extractor returning NOTHING, which would make every
        // assertion below pass vacuously. The floor is deliberately well under the
        // real count: it was 100 against a corpus of ~500-line READMEs, and cutting
        // those to what they had to say dropped the total to 90 — a legitimate fall
        // that failed a control calibrated to the bloat.
        expect(found.length).toBeGreaterThan(40);
    });

    it('every cited module location exists', () => {
        expect(scan(citations, citationResolves)).toEqual([]);
    });

    it('every import in a documented code example resolves', () => {
        // These are the lines a reader copies, so a dead one costs them a compile error.
        expect(scan(imports, importResolves)).toEqual([]);
    });

    it('CONTROL: the checks can actually fail', () => {
        // A detector that has stopped detecting reports "all clear" in the same
        // words as one that verified. These are the four real shapes it must catch.
        expect(citationResolves('@/services/serviceLocator')).toBe(false); // moved to @/core/di
        expect(citationResolves('@/core/errors')).toBe(false); // directory deleted
        expect(importResolves('@/features/mesh')).toBe(false); // barrel deleted
        expect(citationResolves('@/core/di')).toBe(true); // and a live one still passes
    });

    it('CONTROL: a placeholder is not mistaken for a path', () => {
        expect(citations('see `@/features/.../Thing`')).toEqual([]);
        expect(imports("import { T } from '@/features/.../Thing';")).toEqual([]);
    });

    it('the alias table matches tsconfig', () => {
        // The table above is literal so it reads clearly; this keeps it honest.
        const raw = readFileSync(join(ROOT, 'tsconfig.json'), 'utf8').replace(/\/\/.*/g, '');
        const paths: Record<string, string[]> = JSON.parse(raw).compilerOptions.paths;
        const declared = Object.keys(paths).sort();
        const ours = [...Object.keys(ALIASES).map((a) => `${a}*`), ...Object.keys(EXACT)].sort();
        expect(ours).toEqual(declared);
    });

    it('every relative link points at a file that exists', () => {
        // Same rot, different syntax. The audit found seventeen of these: four READMEs
        // linking to `../shared/state/CLAUDE.md` (a directory layout retired long ago),
        // three to a `project-creation/README.md` that was never written, and three to a
        // `troubleshooting.md` that is actually a directory.
        const bad: string[] = [];
        for (const f of docs()) {
            const md = readFileSync(join(ROOT, f), 'utf8');
            for (const m of md.matchAll(/\]\(([^)\s]+?)(?:#[^)]*)?\)/g)) {
                const target = m[1];
                if (/^(https?:|mailto:|#)/.test(target)) continue;
                if (!existsSync(join(ROOT, dirname(f), target))) bad.push(`${f}  ${target}`);
            }
        }
        expect([...new Set(bad)].sort()).toEqual([]);
    });

    it('every backticked repo path names a file that exists', () => {
        // The link check below only reads `](...)`. Docs cite files in backticks too,
        // and two dead ones lived in a See Also list that way for months.
        const bad: string[] = [];
        for (const f of docs()) {
            for (const p of backtickedPaths(readFileSync(join(ROOT, f), 'utf8'))) {
                if (!existsSync(join(ROOT, p)) && !ALLOWED[`${f}::${p}`]) bad.push(`${f}  ${p}`);
            }
        }
        expect([...new Set(bad)].sort()).toEqual([]);
    });

    it('CONTROL: the backticked-path extractor finds paths and skips prose', () => {
        expect(backtickedPaths('see `src/core/validation/README.md` for detail')).toEqual([
            'src/core/validation/README.md',
        ]);
        expect(backtickedPaths('everything under `src/features/` is a feature')).toEqual([]);
        expect(backtickedPaths('a `src/features/{name}/index.ts` barrel')).toEqual([]);
    });

    it('no markdown link target contains a space', () => {
        // A target with a space is not a link at all — and the link check above
        // cannot see it, because its pattern requires a space-free target. A
        // find-and-replace produced `](./development/spectrum-webview-ui skill)`
        // on 2026-08-30 and every reference check stayed green.
        const bad: string[] = [];
        for (const f of docs()) {
            const md = readFileSync(join(ROOT, f), 'utf8');
            for (const m of md.matchAll(/\]\(([^)]*\s[^)]*)\)/g)) {
                const t = m[1];
                if (/^https?:/.test(t) || /^\S+\s+"[^"]*"$/.test(t)) continue; // URL, or title syntax
                bad.push(`${f}  ](${t})`);
            }
        }
        expect([...new Set(bad)].sort()).toEqual([]);
    });

    it('CONTROL: the link check can fail', () => {
        const f = 'docs/development/handbook.md';
        expect(existsSync(join(ROOT, dirname(f), './nope.md'))).toBe(false);
        expect(existsSync(join(ROOT, dirname(f), '../architecture/adr/README.md'))).toBe(true);
    });

    it('every allowlist entry names a reason and still applies', () => {
        for (const [key, reason] of Object.entries(ALLOWED)) {
            expect(reason.length).toBeGreaterThan(20);
            const [file, spec] = key.split('::');
            expect(existsSync(join(ROOT, file))).toBe(true);
            // An entry for something no longer cited is dead weight — say so.
            expect(readFileSync(join(ROOT, file), 'utf8')).toContain(spec);
        }
    });
});
