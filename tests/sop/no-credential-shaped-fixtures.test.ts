/**
 * No credential-SHAPED string under tests/ — `scheme://user:password@host` or
 * `Basic <base64>` — even a fake one.
 *
 * WHY. This repository is public, and its secret scanner (GitGuardian) matches the
 * SHAPE, not the secret. On 2026-09-03 a fixture written minutes earlier —
 * a GitHub clone URL with `gh-token` as the user and `x-oauth-basic` as the password,
 * where the "token" was the literal word
 * gh-token — raised an alert on a pushed commit. It was not a credential and there
 * was nothing to rotate, but the rule here is never-enters, and an alert that has
 * to be triaged by hand each time teaches people to dismiss alerts.
 *
 * WHAT TO DO INSTEAD. Build the URL by parts: `new URL(base)`, set `.username` and
 * `.password`, read it back. The two helper tests that assert the injected-URL
 * contract and the validators that must ACCEPT a credentialed URL all do this now —
 * the same proof, spelled by no literal. Prose in a comment is caught too: write
 * "user-colon-password-at-host", not the shape.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..', '..');

const USERINFO_URL = /https?:\/\/[^/\s:@"'`]+:[^@\s"'`]+@/;
const BASIC_HEADER = /\bBasic\s+[A-Za-z0-9+/]{16,}={0,2}/;

/**
 * The third shape, added 2026-09-05 after GitGuardian raised two alerts this file was
 * built to prevent. It banned exactly two shapes and never looked for the commonest
 * credential of all: a JWT. Anything starting `eyJ` is base64 for `{"`, so a scanner
 * reads a token there whatever it decodes to — the one that fired decoded to
 * `{"some":"thing"}`.
 *
 * SHRINK-ONLY, because 18 such literals in 8 files predate the rule and rewriting them
 * is not this change. A file may lower its count or vanish; it may never raise it, and
 * a file not listed must have none. Build the shape instead: `tests/helpers/jwtFake.ts`
 * assembles a structurally valid token at run time, so no literal enters the source.
 */
const JWT_LITERAL = /eyJ[A-Za-z0-9_-]{12,}/g;

const JWT_CEILINGS: Record<string, number> = {
    'tests/core/validation/securityValidation-network.test.ts': 6,
    'tests/features/eds/handlers/daLive/daLiveAuthPrompt-tokenStrict.test.ts': 2,
    'tests/features/eds/handlers/edsHelpers.test.ts': 3,
    'tests/features/eds/services/configService/configurationService.testUtils.ts': 1,
    'tests/features/eds/services/daLive/daLiveAuthService-parseJwt.test.ts': 2,
    'tests/features/eds/services/daLive/daLiveAuthService.security.test.ts': 1
};


function files(dir: string): string[] {
    const out: string[] = [];
    // `withFileTypes` answers directory-or-file from the SAME syscall as the listing.
    // Asking separately could not: suites run in parallel workers, three of them create
    // and delete probe files under tests/, and an entry that disappears between the
    // listing and the second question fails a run for nothing (2026-09-04). A directory
    // removed before the recursion is that race one level up, so a listing that fails
    // yields nothing rather than throwing.
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...files(p));
        else if (/\.(ts|tsx|js|mjs|json|md)$/.test(entry.name)) out.push(p);
    }
    return out;
}

describe('no credential-shaped string under tests/', () => {
    const corpus = files(join(ROOT, 'tests')).filter((f) => f !== __filename);

    it('CONTROL: the patterns match the shapes they ban and not their by-parts form', () => {
        const plantedUrl = ['https://alice', 'hunter2@example.com/repo'].join(':');
        const plantedHeader = ['Basic', 'dXNlcjpwYXNzd29yZDEyMzQ='].join(' ');
        expect(USERINFO_URL.test(`const u = '${plantedUrl}';`)).toBe(true);
        expect(BASIC_HEADER.test(`headers.Authorization = '${plantedHeader}';`)).toBe(true);
        expect(
            USERINFO_URL.test("const u = new URL('https://example.com/repo'); u.username = 'a';")
        ).toBe(false);
        expect(USERINFO_URL.test('mailto:someone@example.com')).toBe(false);
        expect(BASIC_HEADER.test("scheme === 'Basic'")).toBe(false);
    });

    it('CONTROL: the walk sees the corpus', () => {
        expect(corpus.length).toBeGreaterThan(500);
    });

    it('no file carries either shape', () => {
        const offenders: string[] = [];
        for (const f of corpus) {
            // The walk closed one half of the probe-file race; this closes the other.
            // A path collected a moment ago can be gone by the time it is read, because
            // other suites create and delete files under tests/ in parallel workers.
            // A file that no longer exists carries nothing, so skipping it is correct
            // rather than merely convenient.
            let body: string;
            try {
                body = readFileSync(f, 'utf8');
            } catch {
                continue;
            }
            const lines = body.split('\n');
            lines.forEach((line, i) => {
                if (USERINFO_URL.test(line) || BASIC_HEADER.test(line)) {
                    offenders.push(`${relative(ROOT, f)}:${i + 1}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });

    it('CONTROL: the token pattern matches a built shape and not an ordinary word', () => {
        const planted = ['eyJ', 'hbGciOiJIUzI1NiJ9'].join('');
        expect(planted.match(JWT_LITERAL)).toHaveLength(1);
        expect('const eyJustAName = 1;'.match(JWT_LITERAL)).toBeNull(); // 8 chars: a name, not a token
        expect("fakeJwt({ note: 'x' })".match(JWT_LITERAL)).toBeNull();
    });

    it('no file carries MORE token-shaped literals than its recorded ceiling', () => {
        const counts = new Map<string, number>();
        for (const f of corpus) {
            let body: string;
            try {
                body = readFileSync(f, 'utf8');
            } catch {
                continue;
            }
            const n = (body.match(JWT_LITERAL) ?? []).length;
            if (n) counts.set(relative(ROOT, f), n);
        }
        const over: string[] = [];
        for (const [file, n] of counts) {
            const ceiling = JWT_CEILINGS[file] ?? 0;
            if (n > ceiling) over.push(`${file}: ${n} (ceiling ${ceiling})`);
        }
        // A new token-shaped literal is the thing this rule exists to stop. Build it with
        // tests/helpers/jwtFake.ts instead — the same shape, assembled at run time.
        expect(over).toEqual([]);
    });

    it('the token ledger only shrinks: no ceiling stands above the count on disk', () => {
        const counts = new Map<string, number>();
        for (const f of corpus) {
            let body: string;
            try {
                body = readFileSync(f, 'utf8');
            } catch {
                continue;
            }
            const n = (body.match(JWT_LITERAL) ?? []).length;
            if (n) counts.set(relative(ROOT, f), n);
        }
        const stale = Object.entries(JWT_CEILINGS)
            .filter(([file, ceiling]) => (counts.get(file) ?? 0) < ceiling)
            .map(
                ([file, ceiling]) => `${file}: ceiling ${ceiling}, on disk ${counts.get(file) ?? 0}`
            );
        // Rewriting one of these to use the helper means lowering its ceiling in the
        // same change. Headroom nobody chose is how a ratchet stops ratcheting.
        expect(stale).toEqual([]);
    });
});
