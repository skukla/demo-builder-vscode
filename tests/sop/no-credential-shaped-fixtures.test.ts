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


/**
 * The fourth shape, added 2026-09-06 after GitGuardian flagged `PASSWORD=p#ssword` in a
 * .env parser test — the word "password" with one letter swapped for the character the
 * test was about. Inert, and still an alert somebody had to chase at six in the morning.
 *
 * What a "generic password" detector matches is a KEY that reads like a credential beside
 * a literal VALUE. It cannot tell a fixture from the real thing, which is the point: this
 * repository is public, so the bar is that the shape never enters.
 *
 * The repo's agreed marker (`fake-test-pw-not-a-secret` and its siblings) is exempt — that
 * convention exists precisely so a test can name a password without looking like one.
 *
 * SHRINK-ONLY: 34 such literals in 19 files predate this rule and rewriting
 * them is not this change. A file may lower its count or vanish; it may never raise it,
 * and a file not listed must have none. Build the shape instead —
 * `tests/helpers/credentialShapes.ts` assembles GitHub-token and password shapes at run
 * time, so nothing in the source matches a scanner.
 */
const CREDENTIAL_ASSIGNMENT =
    /\b(?:pass(?:word|wd)?|secret|api[_-]?key|credential)\b\s*[:=]\s*["']([^"'\n]{4,})["']/i;

/** The convention that exists so a fixture can say "password" without being one. */
const AGREED_MARKER =
    /fake[-_]?(?:test|live)|not[-_]?a[-_]?secret|your-api-key|x-oauth-basic|placeholder/i;

const CREDENTIAL_CEILINGS: Record<string, number> = {
    'tests/core/logging/debugLogger-commandDetail.test.ts': 1,
    'tests/core/utils/envVarExtraction.test.ts': 2,
    'tests/core/validation/fieldValidation-commerceUrl.test.ts': 1,
    'tests/core/validation/securityValidation-githubUrl.test.ts': 1,
    'tests/features/ai/server/agentTraceSink.test.ts': 1,
    'tests/features/authentication/services/adobeEntityFetcher-apiServices.test.ts': 2,
    'tests/features/authentication/services/adobeEntityFetcher.credentials.test.ts': 2,
    'tests/features/authentication/services/adobeEntityFetcher.teardown.test.ts': 3,
    'tests/features/authentication/services/adobeWorkspaceCredentials.s2s.test.ts': 1,
    'tests/features/authentication/services/adobeWorkspaceCredentials.testUtils.ts': 2,
    'tests/features/authentication/services/consoleProjectTeardown.test.ts': 2,
    'tests/features/components/services/commerceCredentialStore.test.ts': 1,
    'tests/features/data-installer/handlers/dataInstallerHandlers.test.ts': 1,
    'tests/features/eds/services/commerceStoreDiscovery.test.ts': 6,
    'tests/features/eds/services/toolManager.test.ts': 1,
    'tests/features/eds/services/toolManager.testUtils.ts': 1,
    'tests/features/project-creation/helpers/envFileGenerator-values.test.ts': 1,
    'tests/features/project-creation/ui/helpers/stackHelpers.test.ts': 4,
    'tests/features/projects-dashboard/services/exportProjectSettingsToFile.test.ts': 1,
};

/**
 * The fifth shape, added 2026-09-06. `USERINFO_URL` above matches only `http`/`https`, so
 * three `postgresql://`, `postgres://` and `mongodb+srv://` userinfo URLs have sat in the
 * suite since August without the rule seeing them — and a GitGuardian "basic auth string"
 * alert the same morning was exactly this shape (a token-injected git remote, caught and
 * rewritten by the session four minutes later, but not by this guard).
 *
 * A userinfo URL IS basic auth, whatever the scheme: user and password in the authority,
 * which is what a scanner matches.
 *
 * The http/https rule above stays at ZERO — it is the shape this repo actually produces,
 * and the one the 2026-09-03 alert fired on. This is the wider net, ledgered because the
 * three that predate it are fixtures proving the code REDACTS or REFUSES such a URL, and
 * they need the shape to prove it. Rewrite one with
 * `credentialShapes.credentialedUrlShape` and lower its ceiling in the same change.
 */
const USERINFO_URL_ANY_SCHEME = /[a-z][a-z0-9+.-]*:\/\/[^/\s:@"'`]+:[^@\s"'`]{3,}@/;

const USERINFO_CEILINGS: Record<string, number> = {
    'tests/core/validation/securityValidation-network.test.ts': 1,
    'tests/features/ai/mcpServer-config.test.ts': 1,
    'tests/hooks/router.test.ts': 1,
};

function userinfoUrlCount(body: string): number {
    return body.split('\n').filter((l) => USERINFO_URL_ANY_SCHEME.test(l)).length;
}

function credentialShapeCount(body: string): number {
    let n = 0;
    for (const line of body.split('\n')) {
        const m = CREDENTIAL_ASSIGNMENT.exec(line);
        if (m && !AGREED_MARKER.test(m[1])) n += 1;
    }
    return n;
}

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

    it('CONTROL: the any-scheme pattern catches what http/https misses', () => {
        // The three the narrow rule has been blind to since August.
        expect(userinfoUrlCount("'postgresql://user:pass@host/db'")).toBe(1);
        expect(userinfoUrlCount("'mongodb+srv://svc-user:hunter2pass@cluster0.example.net/db'")).toBe(1);
        // The shape GitGuardian flagged on 2026-09-06 — a token-injected git remote.
        expect(userinfoUrlCount("'https://gh-token-abc:x-oauth-basic@github.com/o/r.git'")).toBe(1);
        // Not userinfo: a port, and a plain URL.
        expect(userinfoUrlCount("'https://host:5432/db'")).toBe(0);
        expect(userinfoUrlCount("'https://example.com/docs#install'")).toBe(0);
        // Built by parts — nothing for a scanner to match.
        expect(userinfoUrlCount('credentialedUrlShape(base, user, pass)')).toBe(0);
    });

    it('no file carries MORE userinfo URLs than its recorded ceiling', () => {
        const over: string[] = [];
        for (const f of corpus) {
            let body: string;
            try {
                body = readFileSync(f, 'utf8');
            } catch {
                continue;
            }
            const rel = relative(ROOT, f);
            const n = userinfoUrlCount(body);
            const ceiling = USERINFO_CEILINGS[rel] ?? 0;
            if (n > ceiling) over.push(`${rel}: ${n} (ceiling ${ceiling})`);
        }
        // Build it with credentialShapes.credentialedUrlShape instead.
        expect(over).toEqual([]);
    });

    it('the userinfo ledger only shrinks: no ceiling stands above the count on disk', () => {
        const stale: string[] = [];
        for (const [file, ceiling] of Object.entries(USERINFO_CEILINGS)) {
            let body: string;
            try {
                body = readFileSync(join(ROOT, file), 'utf8');
            } catch {
                stale.push(`${file}: listed, but the file is gone`);
                continue;
            }
            if (userinfoUrlCount(body) < ceiling) {
                stale.push(`${file}: ceiling ${ceiling}, on disk ${userinfoUrlCount(body)}`);
            }
        }
        expect(stale).toEqual([]);
    });

    it('CONTROL: the credential pattern catches what fired, and clears the agreed marker', () => {
        // The exact line GitGuardian flagged on 2026-09-06.
        expect(credentialShapeCount("            PASSWORD: 'p#ssword',")).toBe(1);
        // `const secret = '<literal>'` IS the shape — a credential-named binding assigned a
        // literal — and the pattern is right to count it. My first version of this control
        // asserted 0 here and the control caught me, not the rule.
        expect(credentialShapeCount('const secret = ' + JSON.stringify('ghp_0123456789abcdef'))).toBe(1);
        // A token literal NOT bound to a credential name is a different rule's problem.
        expect(credentialShapeCount('const url = ' + JSON.stringify('ghp_0123456789abcdef'))).toBe(0);
        expect(credentialShapeCount("apiKey: 'super-secret-value-123',")).toBe(1);
        // The convention that exists so a fixture can name a password safely.
        expect(credentialShapeCount("password: 'fake-test-pw-not-a-secret',")).toBe(0);
        // A key that merely CONTAINS the word is not an assignment of one.
        expect(credentialShapeCount('const passwordFieldLabel = getLabel();')).toBe(0);
        // Built at run time — nothing for a scanner to match.
        expect(credentialShapeCount('password: passwordShape(),')).toBe(0);
    });

    it('no file carries MORE credential-shaped assignments than its recorded ceiling', () => {
        const over: string[] = [];
        for (const f of corpus) {
            let body: string;
            try {
                body = readFileSync(f, 'utf8');
            } catch {
                continue;
            }
            const n = credentialShapeCount(body);
            const rel = relative(ROOT, f);
            const ceiling = CREDENTIAL_CEILINGS[rel] ?? 0;
            if (n > ceiling) over.push(`${rel}: ${n} (ceiling ${ceiling})`);
        }
        // A new one is what this rule exists to stop. Build it with
        // tests/helpers/credentialShapes.ts instead.
        expect(over).toEqual([]);
    });

    it('the credential ledger only shrinks: no ceiling stands above the count on disk', () => {
        const stale: string[] = [];
        for (const [file, ceiling] of Object.entries(CREDENTIAL_CEILINGS)) {
            let body: string;
            try {
                body = readFileSync(join(ROOT, file), 'utf8');
            } catch {
                stale.push(`${file}: listed, but the file is gone`);
                continue;
            }
            const n = credentialShapeCount(body);
            if (n < ceiling) stale.push(`${file}: ceiling ${ceiling}, on disk ${n}`);
        }
        // Rewriting one means lowering its ceiling in the same change.
        expect(stale).toEqual([]);
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
