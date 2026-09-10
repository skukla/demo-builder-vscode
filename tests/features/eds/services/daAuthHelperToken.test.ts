/**
 * Tests for the da-auth-helper token cache reader (~/.aem/da-token.json).
 * Pure file parsing — exercised against real temp files.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    daAuthHelperTokenPath,
    readDaAuthHelperToken,
    writeDaAuthHelperToken,
} from '@/features/eds/services/daAuthHelperToken';

describe('daAuthHelperTokenPath', () => {
    /**
     * This is the path the `da-auth` CLI writes to. Getting any of its three
     * parts wrong means the extension and the skill hold two different caches
     * and neither sees the other's sign-in.
     */
    it('is ~/.aem/da-token.json under the user home', () => {
        const result = daAuthHelperTokenPath();

        expect(path.isAbsolute(result)).toBe(true);
        expect(result.startsWith(os.homedir())).toBe(true);
        expect(result.slice(os.homedir().length)).toBe(path.join(path.sep, '.aem', 'da-token.json'));
    });
});

describe('readDaAuthHelperToken', () => {
    let dir: string;
    let file: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'da-auth-helper-'));
        file = path.join(dir, 'da-token.json');
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('reads access_token + expires_at (ms epoch) and email', () => {
        const expiresAt = Date.now() + 3600_000;
        fs.writeFileSync(file, JSON.stringify({ access_token: 'eyJ.abc', expires_at: expiresAt, email: 'a@b.com' }));

        expect(readDaAuthHelperToken(file)).toEqual({ accessToken: 'eyJ.abc', expiresAt, email: 'a@b.com' });
    });

    it('normalizes a seconds epoch to milliseconds', () => {
        const seconds = Math.floor(Date.now() / 1000) + 3600;
        fs.writeFileSync(file, JSON.stringify({ access_token: 'eyJ.x', expires_at: seconds }));

        const result = readDaAuthHelperToken(file);
        expect(result?.expiresAt).toBe(seconds * 1000);
    });

    it('accepts camelCase key variants', () => {
        const expiresAt = Date.now() + 1000;
        fs.writeFileSync(file, JSON.stringify({ accessToken: 'eyJ.y', expiresAt }));

        expect(readDaAuthHelperToken(file)).toEqual({ accessToken: 'eyJ.y', expiresAt });
    });

    it('returns null when the file is absent', () => {
        expect(readDaAuthHelperToken(path.join(dir, 'nope.json'))).toBeNull();
    });

    it('returns null for malformed JSON', () => {
        fs.writeFileSync(file, '{ not json');
        expect(readDaAuthHelperToken(file)).toBeNull();
    });

    it('returns null when the access token is missing', () => {
        fs.writeFileSync(file, JSON.stringify({ expires_at: Date.now() + 1000 }));
        expect(readDaAuthHelperToken(file)).toBeNull();
    });

    it('returns null when the expiry is missing', () => {
        fs.writeFileSync(file, JSON.stringify({ access_token: 'eyJ.z' }));
        expect(readDaAuthHelperToken(file)).toBeNull();
    });

    /**
     * The seconds/milliseconds guess is made at 1e12, and the boundary itself is
     * milliseconds. 1e12 ms is Sep 2001; as seconds it would be the year 33658,
     * so treating it as seconds hands out a token that never expires.
     */
    it('treats the 1e12 boundary itself as milliseconds', () => {
        fs.writeFileSync(file, JSON.stringify({ access_token: 'eyJ.b', expires_at: 1e12 }));

        expect(readDaAuthHelperToken(file)?.expiresAt).toBe(1e12);
    });

    /** da-auth-helper has written the expiry as a string; both are accepted. */
    it('accepts a numeric expiry written as a string', () => {
        fs.writeFileSync(file, JSON.stringify({ access_token: 'eyJ.s', expires_at: '1700000000' }));

        expect(readDaAuthHelperToken(file)?.expiresAt).toBe(1_700_000_000_000);
    });

    /**
     * A key holding something that is NOT a usable number is skipped, and the
     * next candidate key is read. Accepting one of these coerces to 0 or NaN —
     * an expiry in 1970, or one no comparison is ever true for.
     */
    it.each([
        ['a non-numeric string', 'not-a-number'],
        ['whitespace only', '   '],
        ['an empty string', ''],
        ['null', null],
        ['a boolean', true],
    ])('skips an expires_at holding %s and reads the next key', (_label, bad) => {
        fs.writeFileSync(
            file,
            JSON.stringify({ access_token: 'eyJ.k', expires_at: bad, expiresAt: 12345 }),
        );

        expect(readDaAuthHelperToken(file)?.expiresAt).toBe(12_345_000);
    });

    /** Same rule for the token: an empty string is not a token. */
    it('skips an empty access_token and reads the next key', () => {
        const expiresAt = Date.now() + 1000;
        fs.writeFileSync(
            file,
            JSON.stringify({ access_token: '', accessToken: 'eyJ.real', expires_at: expiresAt }),
        );

        expect(readDaAuthHelperToken(file)).toEqual({ accessToken: 'eyJ.real', expiresAt });
    });
});

describe('writeDaAuthHelperToken', () => {
    let dir: string;
    let file: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'da-auth-helper-w-'));
        file = path.join(dir, 'da-token.json');
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('writes access_token + expires_at when no cache exists', () => {
        const expiresAt = Date.now() + 3600_000;
        expect(writeDaAuthHelperToken({ accessToken: 'eyJ.new', expiresAt }, file)).toBe(true);

        expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ access_token: 'eyJ.new', expires_at: expiresAt });
    });

    it('creates the parent directory if missing', () => {
        const nested = path.join(dir, '.aem', 'da-token.json');
        expect(writeDaAuthHelperToken({ accessToken: 'eyJ.n', expiresAt: Date.now() + 1000 }, nested)).toBe(true);
        expect(fs.existsSync(nested)).toBe(true);
    });

    it('merge-preserves unknown fields da-auth-helper may have written', () => {
        const older = Date.now() + 1000;
        fs.writeFileSync(file, JSON.stringify({ access_token: 'eyJ.old', expires_at: older, refresh_token: 'r1', extra: 1 }));

        const newer = Date.now() + 7200_000;
        expect(writeDaAuthHelperToken({ accessToken: 'eyJ.new', expiresAt: newer }, file)).toBe(true);

        expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
            access_token: 'eyJ.new',
            expires_at: newer,
            refresh_token: 'r1',
            extra: 1,
        });
    });

    it('does not downgrade a fresher cached token (freshness guard)', () => {
        const fresher = Date.now() + 7200_000;
        fs.writeFileSync(file, JSON.stringify({ access_token: 'eyJ.fresh', expires_at: fresher }));

        const older = Date.now() + 1000;
        expect(writeDaAuthHelperToken({ accessToken: 'eyJ.stale', expiresAt: older }, file)).toBe(false);
        // Unchanged.
        expect(JSON.parse(fs.readFileSync(file, 'utf8')).access_token).toBe('eyJ.fresh');
    });

    /**
     * The cache holds a live IMS token. Anything readable by another account on
     * a shared machine is a credential leak, so the mode is part of the write.
     */
    it('writes the cache readable only by its owner', () => {
        writeDaAuthHelperToken({ accessToken: 'eyJ.m', expiresAt: Date.now() + 1000 }, file);

        expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    });

    /**
     * The guard is "at least as fresh", not "fresher". An equal expiry is the
     * same token; rewriting it is a pointless write against a file the CLI may
     * be reading.
     */
    it('does not rewrite when the cached expiry equals ours', () => {
        const same = Date.now() + 3600_000;
        fs.writeFileSync(file, JSON.stringify({ access_token: 'eyJ.cached', expires_at: same }));

        expect(writeDaAuthHelperToken({ accessToken: 'eyJ.ours', expiresAt: same }, file)).toBe(false);
        expect(JSON.parse(fs.readFileSync(file, 'utf8')).access_token).toBe('eyJ.cached');
    });

    it('is best-effort: returns false (no throw) when the path is unwritable', () => {
        // A path whose parent is a file, not a directory → mkdir/write fails.
        const blocker = path.join(dir, 'blocker');
        fs.writeFileSync(blocker, 'x');
        expect(writeDaAuthHelperToken({ accessToken: 'eyJ.x', expiresAt: Date.now() + 1000 }, path.join(blocker, 'da-token.json'))).toBe(false);
    });
});
