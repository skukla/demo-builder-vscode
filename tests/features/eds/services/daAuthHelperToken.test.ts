/**
 * Tests for the da-auth-helper token cache reader (~/.aem/da-token.json).
 * Pure file parsing — exercised against real temp files.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readDaAuthHelperToken, writeDaAuthHelperToken } from '@/features/eds/services/daAuthHelperToken';

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

    it('is best-effort: returns false (no throw) when the path is unwritable', () => {
        // A path whose parent is a file, not a directory → mkdir/write fails.
        const blocker = path.join(dir, 'blocker');
        fs.writeFileSync(blocker, 'x');
        expect(writeDaAuthHelperToken({ accessToken: 'eyJ.x', expiresAt: Date.now() + 1000 }, path.join(blocker, 'da-token.json'))).toBe(false);
    });
});
