/**
 * Finding this directory's newest Copilot CLI session (AI-12 step 08).
 *
 * Driven against a real temporary COPILOT_HOME, laid out the way Copilot CLI
 * 1.0.91 writes it: `session-state/<id>/workspace.yaml` with `cwd:` and `updated_at:`.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { latestCopilotSession } from '@/features/ai/engine/copilotSessionStore';

let home: string;
const savedHome = process.env.COPILOT_HOME;

function writeSession(id: string, yaml: string): void {
    const dir = path.join(home, 'session-state', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workspace.yaml'), yaml);
}

beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-home-'));
    process.env.COPILOT_HOME = home;
});

afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    if (savedHome === undefined) delete process.env.COPILOT_HOME;
    else process.env.COPILOT_HOME = savedHome;
});

describe('latestCopilotSession', () => {
    it('answers the newest session that ran in this directory', () => {
        writeSession('old', 'id: old\ncwd: /p\nupdated_at: 2026-10-01T10:00:00.000Z\n');
        writeSession('new', 'id: new\ncwd: /p\nupdated_at: 2026-10-06T10:00:00.000Z\n');

        expect(latestCopilotSession('/p')).toBe('new');
    });

    it("never answers another directory's session, however recent", () => {
        writeSession('mine', 'cwd: /p\nupdated_at: 2026-10-01T10:00:00.000Z\n');
        writeSession('theirs', 'cwd: /elsewhere\nupdated_at: 2026-10-06T10:00:00.000Z\n');

        expect(latestCopilotSession('/p')).toBe('mine');
    });

    it('reads a quoted cwd', () => {
        writeSession('q', 'cwd: "/p"\nupdated_at: 2026-10-01T10:00:00.000Z\n');

        expect(latestCopilotSession('/p')).toBe('q');
    });

    it('skips a session folder with no workspace.yaml', () => {
        fs.mkdirSync(path.join(home, 'session-state', 'empty'), { recursive: true });
        writeSession('ok', 'cwd: /p\nupdated_at: 2026-10-01T10:00:00.000Z\n');

        expect(latestCopilotSession('/p')).toBe('ok');
    });

    it('answers nothing when Copilot has never run here, or never run at all', () => {
        expect(latestCopilotSession('/p')).toBeUndefined();
        writeSession('x', 'cwd: /elsewhere\n');
        expect(latestCopilotSession('/p')).toBeUndefined();
    });
});
