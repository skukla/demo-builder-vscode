/**
 * The `fs/promises` wall six aiBundle suites share.
 *
 * IMPORTING THIS FILE REGISTERS THE MOCK. `jest.mock` hoists above the imports
 * of the module it appears in, so the call below runs when a suite imports this
 * helper — which must therefore come BEFORE the suite's import of its subject,
 * or the subject binds to the real filesystem. The suites re-export their
 * `fsPromises` handle from here so the import is load-bearing rather than
 * decorative; a bare side-effect import is the kind a tidy-up deletes.
 *
 * WHAT THE SIX AGREE ON, measured 2026-09-02 with comments stripped: the same
 * shape with different key subsets. Three of them (`skillsWriter` and its two
 * split siblings) differed only in the ORDER two keys were declared in, which
 * is why comparing hashes of the raw text said six distinct walls and comparing
 * the bodies said one.
 *
 * The union is deliberate and small. A suite that never calls `readdir` now
 * gets a `jest.fn()` returning undefined where it previously got `undefined`
 * from an absent key — the same value, reached differently. Nothing here
 * carries an implementation beyond resolving, so no suite inherits behaviour it
 * did not ask for.
 *
 * TWO SUITES IN THIS DIRECTORY ARE NOT COVERED, and that is the finding rather
 * than an omission. `homeAiContextWriter` mocks `rm`, which nothing else uses.
 * `aiDefaultsInstaller` defaults `readFile` to REJECT with ENOENT — behaviour,
 * not a key set, and folding it in would hand five other suites a rejecting
 * read they never agreed to. Different walls, left different.
 */

jest.mock('fs/promises', () => {
    const writeFile = jest.fn().mockResolvedValue(undefined);
    return {
        lstat: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
        realpath: jest.fn(async (p: string) => p),
        mkdir: jest.fn().mockResolvedValue(undefined),
        writeFile,
        readFile: jest.fn(),
        readdir: jest.fn(),
        appendFile: jest.fn().mockResolvedValue(undefined),
        unlink: jest.fn().mockResolvedValue(undefined),
        // O_NOFOLLOW writes go through open(); the returned handle delegates to
        // the writeFile mock WITH the path, so path-based assertions keep working.
        open: jest.fn(async (p: unknown) => ({
            writeFile: jest.fn(async (d: unknown, e: unknown) => writeFile(p as string, d, e)),
            close: jest.fn(async () => undefined),
        })),
    };
});

// Below the mock on purpose — see the note above about hoisting.
export * as fsPromises from 'fs/promises';
