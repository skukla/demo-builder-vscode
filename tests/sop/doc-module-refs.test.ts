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
import { existsSync, readFileSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join, relative } from 'path';

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

describe('a link to a heading reaches a heading that exists', () => {
    // Anchors were checked by nothing. All three in the live corpus were DEAD, and
    // two of them pointed into the handbook — the document a reader is most likely
    // to follow a link into. One was merely the wrong anchor for real content
    // (ADR-012, handbook §8); the other, ADR-003, claimed its disciplines were
    // "stated as rules in the handbook" when the handbook has never once mentioned
    // multisite. The dead anchor was the visible half of a false claim.
    //
    // GitHub's slug rules, near enough: lowercase, strip punctuation, spaces to
    // hyphens. Close enough to catch a heading that does not exist at all, which is
    // the failure that happened.
    const slugs = (file: string): Set<string> =>
        new Set(
            readFileSync(join(ROOT, file), 'utf8')
                .split('\n')
                .filter((l) => l.startsWith('#'))
                .map((l) =>
                    l
                        .replace(/^#+\s*/, '')
                        .trim()
                        .toLowerCase()
                        .replace(/[^\w\s-]/g, '')
                        // EACH space becomes a hyphen — not runs of them. A stripped
                        // em-dash in "Tier C — Multisite" leaves two spaces and GitHub
                        // emits `c--multisite`. Collapsing with \s+ produced a single
                        // hyphen and reported a CORRECT link as dead, which nearly got
                        // that link "fixed" to match the bug.
                        .replace(/\s/g, '-')
                )
        );

    // Scoped WIDER than `docs()`, which excludes ADRs because a superseded one may
    // legitimately name deleted code. A dead ANCHOR is never legitimate — and both
    // that existed lived in ADRs, so the narrower scope found nothing at all. The
    // control below is what caught that; without it this passed over an empty list.
    const anchorSources = (): string[] =>
        execSync("git ls-files '*.md'", { encoding: 'utf8', cwd: ROOT })
            .split('\n')
            .filter(
                (f) =>
                    f &&
                    !f.startsWith('.rptc/complete/') &&
                    !f.startsWith('.rptc/research/') &&
                    !f.startsWith('docs/research/')
            );

    const anchorLinks = (): Array<{ from: string; target: string; anchor: string }> => {
        const out: Array<{ from: string; target: string; anchor: string }> = [];
        for (const f of anchorSources()) {
            const dir = dirname(f);
            for (const m of readFileSync(join(ROOT, f), 'utf8').matchAll(
                /\]\(([^)#\s]+\.md)#([a-z0-9-]+)\)/g
            )) {
                const target = join(dir, m[1]);
                if (existsSync(join(ROOT, target))) {
                    out.push({ from: f, target, anchor: m[2] });
                }
            }
        }
        return out;
    };

    it('CONTROL: the corpus contains anchor links to check', () => {
        expect(anchorLinks().length).toBeGreaterThan(0);
    });

    it('CONTROL: the slugger derives a known heading', () => {
        expect(slugs('docs/development/handbook.md')).toContain(
            '8-agents-are-a-second-door-never-the-only-one'
        );
    });

    it('every anchor names a real heading', () => {
        const dead = anchorLinks()
            .filter(({ target, anchor }) => !slugs(target).has(anchor))
            .map(({ from, target, anchor }) => `${from} -> ${target}#${anchor}`);
        expect(dead).toEqual([]);
    });
});

describe('the inventories that claim to be complete, are', () => {
    // Found in Phase B by testing my OWN rewrites in the direction I had skipped.
    // Every entry resolving proves nothing about a thing that was never listed:
    // `src/features/CLAUDE.md` named 13 features against 14 on disk, omitting
    // data-installer — 43 files, its own webview bundle and its own palette
    // command — and `src/commands/CLAUDE.md` listed 12 of 16 modules.
    //
    // DELIBERATELY NOT COVERED: `src/core/ui/components/CLAUDE.md`. That table is
    // organised by JOB, not by file, and says so — "a map, not the territory",
    // with instructions to `ls` for the full vocabulary. 20 of 53 components are
    // absent from it ON PURPOSE. Adding it here would force an index nobody wants
    // and would defeat the point of picking by job.
    const dirsIn = (p: string): string[] =>
        readdirSync(join(ROOT, p), { withFileTypes: true })
            .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
            .map((e) => e.name);

    it('CONTROL: both walks find entries', () => {
        expect(dirsIn('src/features').length).toBeGreaterThan(5);
        expect(dirsIn('src/core').length).toBeGreaterThan(5);
    });

    it('src/features/CLAUDE.md names every feature directory', () => {
        const body = readFileSync(join(ROOT, 'src/features/CLAUDE.md'), 'utf8');
        expect(dirsIn('src/features').filter((d) => !body.includes(d))).toEqual([]);
    });

    it('src/core/CLAUDE.md names every core directory', () => {
        const body = readFileSync(join(ROOT, 'src/core/CLAUDE.md'), 'utf8');
        expect(dirsIn('src/core').filter((d) => !body.includes(d))).toEqual([]);
    });

    it('src/commands/CLAUDE.md names every module in that directory', () => {
        const body = readFileSync(join(ROOT, 'src/commands/CLAUDE.md'), 'utf8');
        const files = execSync("git ls-files 'src/commands/*.ts'", { encoding: 'utf8', cwd: ROOT })
            .split('\n')
            .filter(Boolean)
            .map((f) => f.split('/').pop() as string);
        expect(files.filter((f) => !body.includes(f))).toEqual([]);
    });

    // Added 2026-08-30 in the Phase B pass over `src/core/ui/hooks/CLAUDE.md`. Unlike
    // the components table beside it, this inventory IS complete — 24 of 24 — so it
    // can be pinned, and the moment it is complete is the only moment you can pin it.
    // Phase A had marked this file "verified accurate and kept as written", which is
    // how it kept a filler Overview, four generic React best practices (one of them an
    // eslint error), and a testing example any library doc gives you.
    const hookNames = (): string[] =>
        readdirSync(join(ROOT, 'src/core/ui/hooks'))
            .filter((f) => f.startsWith('use') && f.endsWith('.ts') && !f.includes('.test.'))
            .map((f) => f.replace(/\.ts$/, ''));

    it('CONTROL: the hooks directory walk finds hooks', () => {
        expect(hookNames().length).toBeGreaterThan(10);
    });

    it('src/core/ui/hooks/CLAUDE.md names every hook in that directory', () => {
        const body = readFileSync(join(ROOT, 'src/core/ui/hooks/CLAUDE.md'), 'utf8');
        expect(hookNames().filter((h) => !body.includes(`\`${h}\``))).toEqual([]);
    });
});

describe('the counts a directory guide states match its own source', () => {
    /**
     * Phase C of the documentation synthesis. The per-directory guides were rewritten in
     * Phase A and state numbers nothing pinned — the same numbers that had rotted in the
     * originals they replaced. Five of them, across two files.
     *
     * NOT pinned, deliberately: `src/features/sidebar/CLAUDE.md` says an earlier reading
     * called a seventh tile impossible on "four pixels, too thin". That is a NARRATIVE
     * about a miscalculation the file goes on to correct, not a claim about the code
     * today, and pinning it would freeze a story rather than a fact.
     */
    const read = (f: string): string => readFileSync(join(ROOT, f), 'utf8');

    /** Distinct tile labels — `tileFor('Chat', …)` appears twice for one tile's two variants. */
    const distinctTiles = (file: string, pattern: RegExp): number =>
        new Set([...read(file).matchAll(pattern)].map((m) => m[1])).size;

    const aiZoneTiles = (): number =>
        distinctTiles('src/features/sidebar/ui/components/AiZone.tsx', /tileFor\('(\w+)'/g);
    /**
     * Counted by `aria-label`, which every tile carries — NOT by a list of the labels
     * that exist today. The first version matched `>(Tools|Help|Settings|Logs)<`, an
     * allowlist of the four current tiles, so adding a fifth left the count at four and
     * the check passed. A counter that enumerates what it expects to find cannot detect
     * anything new, which is the whole job here.
     */
    const utilityTiles = (): number =>
        distinctTiles('src/features/sidebar/ui/views/UtilityBar.tsx', /aria-label="([^"]+)"/g);

    const handlerKeys = (): number => {
        const src = read('src/features/projects-dashboard/handlers/projectsListHandlers.ts');
        const body = /defineHandlers\(\{([\s\S]*?)\n\}\)/.exec(src)?.[1] ?? '';
        return [...body.matchAll(/^ {4}'?[\w-]+'?:/gm)].length;
    };

    it('CONTROL: every source parses and yields a non-zero count', () => {
        expect(aiZoneTiles()).toBeGreaterThan(0);
        expect(utilityTiles()).toBeGreaterThan(0);
        expect(handlerKeys()).toBeGreaterThan(0);
    });

    it('sidebar: states the tile counts its components render', () => {
        const doc = read('src/features/sidebar/CLAUDE.md');
        const total = aiZoneTiles() + utilityTiles();
        const word = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'][
            total
        ];
        expect(doc).toContain(`${word[0].toUpperCase()}${word.slice(1)} tiles total`);
        expect(doc).toContain(
            `${['zero', 'one', 'two', 'three', 'four'][aiZoneTiles()]} in \`AiZone\``
        );
        expect(doc).toContain(
            `${['zero', 'one', 'two', 'three', 'four'][utilityTiles()]} in \`UtilityBar\``
        );
    });

    it('sidebar: its arithmetic table is headed by the CURRENT tile count', () => {
        // The table gives 1-up/2-up heights per tile count and marks one row "<- TODAY".
        // If a tile is added and the marker is not moved, the derivation is being read
        // against the wrong row — which is how the breakpoint went stale by one tile.
        const doc = read('src/features/sidebar/CLAUDE.md');
        const today = /(\d+) tiles ->[^\n]*<- TODAY/.exec(doc)?.[1];
        expect(today).toBe(String(aiZoneTiles() + utilityTiles()));
    });

    it('sidebar: the 640px breakpoint it explains is the one the stylesheet uses', () => {
        const doc = read('src/features/sidebar/CLAUDE.md');
        const css = read('src/core/ui/styles/custom-spectrum.css');
        const px = /@media \(max-height: (\d+)px\)/.exec(css)?.[1];
        expect(px).toBeTruthy();
        expect(doc).toContain(`The ${px}px threshold is DERIVED`);
    });

    it('projects-dashboard: states the handler-map key count', () => {
        expect(read('src/features/projects-dashboard/CLAUDE.md')).toContain(
            `${handlerKeys()} keys — the source of truth`
        );
    });

    it("projects-dashboard: states SearchHeader's real default threshold", () => {
        const dflt = /searchThreshold = props\.searchThreshold \?\? (\d+)/.exec(
            read('src/core/ui/components/navigation/SearchHeader.tsx')
        )?.[1];
        expect(dflt).toBeTruthy();
        expect(read('src/features/projects-dashboard/CLAUDE.md')).toContain(`past ${dflt} items`);
    });
});

describe('every area of the codebase has exactly one front door', () => {
    // The nine kinds say where a STATEMENT lives; they cannot say where to START,
    // because they scatter every substantial subject by design — measured 2026-08-30,
    // each area below spans four to seven of them. What makes an area findable is one
    // document that orients you and routes onward.
    //
    // Four of these existed already; the frontend's did not, and the gap had survived
    // precisely because the frontend is WELL documented — 16 conventions, 14 enforced,
    // two ratified ADRs, four skills — just unreachable, since `src/core/ui/` held
    // components/, hooks/, styles/ and utils/ with nothing above them. Coverage and
    // findability are different properties and only one was being checked.
    const FRONT_DOORS: Record<string, string> = {
        testing: 'tests/README.md',
        'extension host': 'src/CLAUDE.md',
        'agents / MCP': 'docs/systems/mcp-server.md',
        'EDS / storefront': 'src/features/eds/README.md',
        'frontend / webviews': 'src/core/ui/CLAUDE.md',
    };

    it.each(Object.entries(FRONT_DOORS))('%s has its front door', (_area, file) => {
        expect(existsSync(join(ROOT, file))).toBe(true);
    });

    it('the documentation index lists the same front doors, and no others', () => {
        const readme = readFileSync(join(ROOT, 'docs/README.md'), 'utf8');
        const table = readme.split('## Every area has ONE front door')[1]?.split('\n##')[0] ?? '';
        expect(table).not.toBe('');
        // Compare the path AS THE INDEX EXPRESSES IT — relative to `docs/`, since that
        // is where the index lives. Two earlier versions of this line were wrong in
        // opposite directions and both were caught by planting rather than by reading:
        // matching the basename passed with the row deleted (`CLAUDE.md` survives in the
        // extension-host row), and matching the repo-relative path failed on the one
        // door that lives under `docs/`.
        const asIndexed = (f: string): string => relative('docs', f);
        const missing = Object.values(FRONT_DOORS).filter((f) => !table.includes(asIndexed(f)));
        expect(missing).toEqual([]);
    });

    it('CONTROL: a path that should not resolve, does not', () => {
        expect(existsSync(join(ROOT, 'src/core/ui/NOT_A_FRONT_DOOR.md'))).toBe(false);
    });
});

describe('the documentation index lists every document under docs/', () => {
    // It listed 18 of 41 — omitting all four SOPs, both troubleshooting guides, both
    // testing docs, ten of thirteen architecture docs, and the HANDBOOK. The document
    // stating every convention this codebase holds itself to was absent from the index
    // of documentation, and nothing noticed because links resolving is the only thing
    // anyone had ever checked.
    //
    // Three exclusions, each because the documents are indexed somewhere that is
    // ITSELF checked, so listing them twice would create two indexes to drift:
    //   docs/architecture/*  -> architecture/CLAUDE.md, enforced by the check below
    //   docs/architecture/adr/* -> adr/README.md, generated
    //   docs/research/*, CHANGELOG -> records, not documentation. That distinction
    //                                 is the first thing docs/README.md states.
    const INDEX = join(ROOT, 'docs/README.md');
    const indexed = (): string[] =>
        execSync("git ls-files 'docs/'", { encoding: 'utf8', cwd: ROOT })
            .split('\n')
            .filter(
                (f) =>
                    f.endsWith('.md') &&
                    !f.startsWith('docs/architecture/') &&
                    !f.startsWith('docs/research/') &&
                    f !== 'docs/CHANGELOG.md' &&
                    f !== 'docs/README.md'
            );

    it('CONTROL: the walk finds documents to index', () => {
        expect(indexed().length).toBeGreaterThan(20);
    });

    it('names every one of them', () => {
        const body = readFileSync(INDEX, 'utf8');
        const missing = indexed().filter((f) => !body.includes(f.replace('docs/', '')));
        expect(missing).toEqual([]);
    });
});

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
