/**
 * A field with a fallback rule is read through that rule, everywhere.
 *
 * Two fields carry one: the DA.live org IS the GitHub namespace, and the DA.live
 * site name IS the repo name. The loader STRIPS a site that merely duplicates the
 * repo, so a normal project reaches every reader without one — and a project
 * created before orgs were stored reaches them without that either.
 *
 * Read raw, both go silently wrong rather than loudly:
 *
 *   2026-09-20  the edit wizard's seed read the site raw, so every migrated
 *               project walked the whole wizard and was refused at the LAST step
 *               with "Storefront configuration is incomplete".
 *   2026-09-20  the same function read the org raw, one line above.
 *   earlier     the cleanup extractor read the site raw, and deleting a migrated
 *               project skipped taking its DA.live site down. Its comment still
 *               records it; the ORG half was still raw when this check was written.
 *
 * WHAT IS CHECKED, and why it is narrow. A lone read is often correct — the
 * storefront-name migration READS the raw site as its detection signal, and a log
 * line naming what was stored is not a bug. What broke every time is the PAIR: a
 * DA.live target assembled from both halves, with one read raw. So the rule is
 * about pairs, and a pair must derive both halves or say why not.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

interface Ledger {
    _what: string;
    pairsThatDoNotDerive: Record<string, string>;
}

const ROOT = join(__dirname, '..', '..');
const LEDGER: Ledger = JSON.parse(
    readFileSync(join(__dirname, 'derived-fields.ledger.json'), 'utf8'),
);

/** A read of either half off component metadata. */
const READ =
    /metadata\s*(?:\?\.|\.)\s*(daLiveSite|daLiveOrg)\b|metadata\s*\??\[\s*['"](daLiveSite|daLiveOrg)['"]\s*\]/g;

/** The value both halves fall back to. Naming it counts as deriving. */
const FALLBACK = /githubRepo|repoFullName|repoOwner|repoName/;

/** How close two reads must be to count as one target being assembled. */
const PAIR_WINDOW = 15;

const SOURCES = execSync('git ls-files src', { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

interface Pair {
    file: string;
    from: number;
    to: number;
    derives: boolean;
}

/** Every place both halves are read close enough together to be one target. */
function pairs(source: (file: string) => string): Pair[] {
    const found: Pair[] = [];
    for (const file of SOURCES) {
        const text = source(file);
        if (!text) continue;
        const lines = text.split('\n');
        const reads = [...text.matchAll(READ)].map((m) => ({
            line: text.slice(0, m.index).split('\n').length,
            field: m[1] ?? m[2],
        }));
        for (let i = 0; i < reads.length; i++) {
            const next = reads
                .slice(i + 1)
                .find((r) => r.field !== reads[i].field && r.line - reads[i].line <= PAIR_WINDOW);
            if (!next) continue;
            const block = lines.slice(reads[i].line - 1, next.line + 2).join('\n');
            found.push({
                file,
                from: reads[i].line,
                to: next.line,
                derives: FALLBACK.test(block),
            });
            break; // one pair per file is enough to judge the file
        }
    }
    return found;
}

const onDisk = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

describe('a field with a fallback rule is read through it', () => {
    const found = pairs(onDisk);

    it('CONTROL: the scan finds the places that assemble a DA.live target', () => {
        expect(SOURCES.length).toBeGreaterThan(500);
        expect(found.length).toBeGreaterThan(5);
        // The canonical reader, which derives both halves.
        expect(found.some((p) => p.file === 'src/types/typeGuards.ts' && p.derives)).toBe(true);
    });

    it('CONTROL: a pair that names no fallback reads as NOT deriving', () => {
        const raw = `const org = metadata.daLiveOrg as string;
                     const site = metadata.daLiveSite as string;`;
        const derived = `const org = (metadata.daLiveOrg as string) ?? githubRepo?.split('/')[0];
                         const site = (metadata.daLiveSite as string) ?? githubRepo?.split('/')[1];`;

        const only = (text: string): Pair[] =>
            pairs((file) => (file === SOURCES[0] ? text : ''));

        expect(only(raw).map((p) => p.derives)).toEqual([false]);
        expect(only(derived).map((p) => p.derives)).toEqual([true]);
    });

    it('every pair derives both halves, or says why it does not', () => {
        const bare = found.filter((p) => !p.derives).map((p) => p.file);
        const listed = Object.keys(LEDGER.pairsThatDoNotDerive);

        const unexplained = bare.filter((file) => !listed.includes(file));
        const stale = listed.filter((file) => !bare.includes(file));
        const thinReasons = Object.entries(LEDGER.pairsThatDoNotDerive)
            .filter(([, reason]) => reason.trim().length < 25)
            .map(([file]) => file);

        expect({ unexplained, stale, thinReasons }).toEqual({
            unexplained: [],
            stale: [],
            thinReasons: [],
        });
    });
});
