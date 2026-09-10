/**
 * No test assigns a `jest.fn()` onto a Node builtin's namespace object.
 *
 * WHY THIS EXISTS. `fs.promises`, `os` and friends are ONE object per worker
 * process. Jest resets its module registry between test files; it does not
 * rebuild Node's builtins. So `fs.readFile = jest.fn()` is not a mock scoped to
 * your test — it is a mutation of a global that every later suite in that worker
 * inherits.
 *
 * `restoreMocks` cannot save you: jest restores the spies IT created, and a raw
 * property assignment is not one. Neither is a hand-rolled restore enough — put
 * it at the end of the test body and it never runs when an assertion above it
 * throws.
 *
 * What makes it expensive is how it presents. The victim is a DIFFERENT file,
 * it fails only when the two land in the same worker in the right order, and it
 * passes in isolation — so it reads as flakiness and gets re-run rather than
 * fixed.
 *
 * Measured 2026-09-10. `debugLogger-pathValidation.test.ts` assigned `readFile`
 * and `unlink` onto `require('fs').promises` and handed only `readFile` back.
 * The abandoned `unlink` mock outlived the file; the next suite's
 * `jest.spyOn(fs, 'unlink')` then returned that already-mocked property AS IS
 * rather than wrapping it — call history included — and
 * `debugLogger-fileIO.test.ts` failed `expect(unlink).not.toHaveBeenCalled()`
 * with four calls it never made. One full run red, the next green, same tree.
 *
 * THE FIX IS ALWAYS THE SAME: `jest.spyOn(fs, 'unlink')`, plus
 * `jest.restoreAllMocks()` in `afterEach` so the restore survives a throw.
 *
 * WHAT THIS CANNOT DO: it does not catch mutation of a non-builtin shared
 * module, and it does not catch `Object.defineProperty` on a builtin. It bans
 * the one shape that has actually cost this repo a debugging session.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..', '..');
const TESTS = join(ROOT, 'tests');

/**
 * A receiver that names a Node builtin namespace, optionally reached through
 * `.promises`, being assigned a jest mock.
 *
 * A cast around the receiver is NOT matched, deliberately. Type-erasing casts are
 * already banned outright in tests by `tests/sop/type-erasing-casts.test.ts`, so a
 * cast form cannot reach the tree for this suite to catch — and writing one into a
 * control string here would raise that suite's shrink-only ledger for something
 * that is not a cast at all. Zero cast-form instances have ever been measured.
 */
const ASSIGNMENT =
    /\b(?:fs|fsp|fsPromises|os|path|crypto|net|http|https|childProcess|child_process)\b(?:\.promises)?\.[A-Za-z_$][\w$]*\s*=\s*jest\.fn\b/;

/** A line that is entirely a comment — prose about the rule, not an assignment. */
const COMMENT = /^\s*(?:\/\/|\/?\*)/;

const SELF = 'no-builtin-namespace-mock-assignment.test.ts';

function testFiles(dir: string): string[] {
    const out: string[] = [];
    // One syscall rather than two, so a probe directory another suite deletes
    // mid-walk cannot fail this run — see no-jest-environment-docblocks.
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...testFiles(p));
        else if (/\.(test|testUtils)\.tsx?$/.test(entry.name)) out.push(p);
    }
    return out;
}

describe('no test mutates a Node builtin namespace with jest.fn', () => {
    const files = testFiles(TESTS);

    it('CONTROL: the walk finds the suite tree', () => {
        // An empty list would pass the real check vacuously.
        expect(files.length).toBeGreaterThan(500);
        expect(files.some((f) => f.endsWith('debugLogger-pathValidation.test.ts'))).toBe(true);
    });

    it('CONTROL: the pattern matches the shape that caused the bug', () => {
        // The two lines as they were actually written, 2026-09-10.
        expect(ASSIGNMENT.test("        fs.readFile = jest.fn().mockResolvedValue('');")).toBe(
            true
        );
        expect(ASSIGNMENT.test('        fs.unlink = jest.fn().mockResolvedValue(undefined);')).toBe(
            true
        );
        // Reached through `.promises`, and on another builtin namespace.
        expect(ASSIGNMENT.test('fs.promises.readFile = jest.fn();')).toBe(true);
        expect(ASSIGNMENT.test('os.homedir = jest.fn();')).toBe(true);
    });

    it('CONTROL: the pattern does NOT match the correct forms', () => {
        // The fix itself must not be a violation.
        expect(ASSIGNMENT.test("jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);")).toBe(
            false
        );
        // A local object of mocks is fine — it is not a builtin.
        expect(ASSIGNMENT.test('const fakeFs = { readFile: jest.fn() };')).toBe(false);
        // Assigning onto something that merely has a similar member name.
        expect(ASSIGNMENT.test('mockContext.readFile = jest.fn();')).toBe(false);
    });

    // The scan skips comment lines and this file. Both are escape hatches, so both
    // have to be shown to be NARROW — an over-broad skip is how a guard goes quiet.
    it('CONTROL: the comment skip does not swallow real code', () => {
        expect(COMMENT.test('        fs.unlink = jest.fn();')).toBe(false);
        expect(COMMENT.test('        // fs.unlink = jest.fn();')).toBe(true);
        expect(COMMENT.test('     * fs.unlink = jest.fn();')).toBe(true);
    });

    it('no builtin namespace is mutated with jest.fn anywhere under tests/', () => {
        const offenders: string[] = [];
        for (const file of files) {
            // This file QUOTES the banned shape, in its header and in the controls
            // above — that is what a control is. Scanning itself would make the
            // suite permanently red for describing the rule it enforces.
            if (file.endsWith(SELF)) continue;
            const lines = readFileSync(file, 'utf8').split('\n');
            lines.forEach((line, i) => {
                // A comment naming the shape is prose, not a mutation. The fix in
                // debugLogger-pathValidation carries exactly such a note, saying
                // what the test used to do and why it stopped.
                if (COMMENT.test(line)) return;
                if (ASSIGNMENT.test(line)) {
                    offenders.push(`${relative(ROOT, file)}:${i + 1}`);
                }
            });
        }
        // Use jest.spyOn instead, and restore in afterEach — see the header.
        expect(offenders).toStrictEqual([]);
    });
});
