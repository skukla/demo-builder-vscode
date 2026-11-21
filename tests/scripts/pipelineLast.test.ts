/**
 * `scripts/lib/pipelineLast.js` — a periodic check writes its own `last:` date into
 * `.pipeline.yaml` when it ran (PL-107). The manifest shape below is the real one's
 * `periodic:` block, so a format change there fails here first.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { recordRun, withLast } from '../../scripts/lib/pipelineLast';

const MANIFEST = [
    'checks: [npm run gate]',
    'periodic:',
    '  reflect:        { budget: 3 releases or 30 days, last: 2026-11-16 }',
    '  battery:        { budget: 3 releases or 30 days }',
    '  eds-drift:      { budget: 3 releases or 30 days }',
    'repo_hooks: .githooks',
    '',
].join('\n');

describe('withLast', () => {
    it('adds a date to a step that has never run', () => {
        expect(withLast(MANIFEST, 'battery', '2026-11-21')).toContain(
            '  battery:        { budget: 3 releases or 30 days, last: 2026-11-21 }'
        );
    });

    it('moves the date of a step that ran before, and touches no other line', () => {
        const after = withLast(MANIFEST, 'reflect', '2026-11-21');
        expect(after).toContain(
            '  reflect:        { budget: 3 releases or 30 days, last: 2026-11-21 }'
        );
        expect(after.replace('2026-11-21', '2026-11-16')).toBe(MANIFEST);
    });

    it('matches the whole step name, so eds-drift is not read as a step called drift', () => {
        expect(() => withLast(MANIFEST, 'drift', '2026-11-21')).toThrow('no periodic step "drift"');
    });

    it('refuses a date freshness could not parse', () => {
        expect(() => withLast(MANIFEST, 'battery', '21 Nov')).toThrow('not a YYYY-MM-DD date');
    });
});

describe('recordRun', () => {
    let dir: string;
    let file: string;
    let log: jest.SpyInstance;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-last-'));
        file = path.join(dir, '.pipeline.yaml');
        fs.writeFileSync(file, MANIFEST);
        log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        log.mockRestore();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('writes the date to the manifest and says so', () => {
        expect(recordRun('eds-drift', { file, date: '2026-11-21' })).toBe(true);
        expect(fs.readFileSync(file, 'utf8')).toContain(
            'eds-drift:      { budget: 3 releases or 30 days, last: 2026-11-21 }'
        );
        expect(log).toHaveBeenCalledWith('\n(eds-drift: last run recorded in .pipeline.yaml)');
    });

    it('reports an unknown step without throwing, and leaves the manifest as it was', () => {
        expect(recordRun('sweep', { file, date: '2026-11-21' })).toBe(false);
        expect(fs.readFileSync(file, 'utf8')).toBe(MANIFEST);
        expect(log).toHaveBeenCalledWith(
            '\n(sweep: last run NOT recorded: .pipeline.yaml has no periodic step "sweep")'
        );
    });
});
