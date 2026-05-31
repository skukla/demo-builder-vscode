/**
 * Tests for the Claude session-store probe.
 *
 * `hasConversation(cwd)` answers: does Claude Code have a persisted
 * conversation for this working directory? Used by `OpenInClaudeCommand`
 * to decide whether `--continue` is safe on launch (it errors with
 * "No conversation found to continue" on cold start).
 *
 * Claude Code's storage convention (verified empirically): the absolute
 * cwd is encoded by replacing `/` with `-`, then stored under
 * `~/.claude/projects/<encoded>/<session>.jsonl`. Encoding is not a
 * documented API; this test pins the empirically-observed behavior so
 * a future Claude Code change can be noticed and corrected.
 */

// Mock os.homedir so the production code's path resolution targets a
// disposable temp directory in this test. Other os APIs (tmpdir, etc.)
// keep their real implementations.
jest.mock('os', () => {
    const actual = jest.requireActual('os') as typeof import('os');
    return { ...actual, homedir: jest.fn(() => actual.homedir()) };
});

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

import { hasConversation } from '@/commands/claudeSessionStore';

describe('claudeSessionStore.hasConversation', () => {
    let tempHome: string;

    beforeEach(() => {
        tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-session-test-'));
        (os.homedir as jest.Mock).mockReturnValue(tempHome);
    });

    afterEach(() => {
        fs.rmSync(tempHome, { recursive: true, force: true });
    });

    /**
     * Helper: write a fake session file for the given cwd, mirroring
     * Claude Code's `/`-to-`-` encoding under `~/.claude/projects/`.
     */
    const seedSession = (cwd: string, sessionFile = 'session.jsonl'): void => {
        const encoded = cwd.replace(/\//g, '-');
        const dir = path.join(tempHome, '.claude', 'projects', encoded);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, sessionFile), '{"role":"user","content":"hi"}\n');
    };

    it('returns false when no Claude home directory exists', () => {
        expect(hasConversation('/projects/demo')).toBe(false);
    });

    it('returns false when the project has no encoded directory', () => {
        // Create the .claude/projects parent but not the project-specific encoded dir.
        fs.mkdirSync(path.join(tempHome, '.claude', 'projects'), { recursive: true });

        expect(hasConversation('/projects/demo')).toBe(false);
    });

    it('returns false when the encoded directory exists but is empty', () => {
        const encoded = '/projects/demo'.replace(/\//g, '-');
        fs.mkdirSync(path.join(tempHome, '.claude', 'projects', encoded), { recursive: true });

        expect(hasConversation('/projects/demo')).toBe(false);
    });

    it('returns true when at least one .jsonl session file exists for the cwd', () => {
        seedSession('/projects/demo');

        expect(hasConversation('/projects/demo')).toBe(true);
    });

    it('encodes the cwd by replacing slashes with dashes', () => {
        // Seed under the encoded path; the function should find it via the same scheme.
        seedSession('/Users/kukla/Documents/Repositories/app-builder/demo-builder-vscode');

        expect(
            hasConversation('/Users/kukla/Documents/Repositories/app-builder/demo-builder-vscode'),
        ).toBe(true);
    });

    it('does not match a different cwd that happens to share a prefix', () => {
        seedSession('/projects/demo');

        // /projects/demo-extra encodes differently — must not be confused with /projects/demo.
        expect(hasConversation('/projects/demo-extra')).toBe(false);
    });

    it('returns false when the filesystem read throws (treats unknown as cold start)', () => {
        // Point at a path that statSync can resolve (the parent exists) but readdir cannot
        // — simulated by passing a path with embedded null byte, which fs rejects.
        // This is the defensive branch: any error → cold start.
        const cwdWithBadByte = '/projects/demo\0bad';

        expect(hasConversation(cwdWithBadByte)).toBe(false);
    });
});
