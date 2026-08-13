/**
 * SOP: every `core/ui/Modal` is hosted.
 *
 * `core/ui/Modal` is a Spectrum `Dialog` with no overlay of its own, and **a bare
 * Spectrum Dialog renders NOTHING**. It has to sit inside a `DialogContainer` or a
 * `DialogTrigger`. Miss that and there is no error, no warning and no failing test
 * — the button simply does nothing when pressed.
 *
 * WHY THIS IS A SOURCE-READING TEST AND NOT A COMPONENT TEST. Every webview suite
 * mocks `Modal`, so the body renders happily into a stub where a real Dialog would
 * have swallowed it. **A mock cannot verify the contract it replaces**: mount-level
 * hosting is invisible through a mocked child by construction, so no number of
 * green component tests can answer this question. It has to be asked of the source.
 *
 * The incident: `ImportDatapackModal` shipped with neither host and never rendered
 * once, from the day it was written through five green gates and four reports of
 * "green" — found only when a human pressed the button (fixed in 88277fbd).
 *
 * **Both hosts count.** `DialogTrigger`'s render-prop form
 * (`<DialogTrigger><ActionButton/>{() => <Modal/>}</DialogTrigger>`) is equally
 * valid, and a check that looks only for `DialogContainer` reports the EDS repo
 * helper as broken when it is fine. That false positive was made for real before
 * this test existed; the `||` below is the fix and must not be "simplified" away.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');

/** How `core/ui/Modal` is imported, by either spelling. */
const IMPORTS_MODAL = /from\s+['"](?:@\/core\/ui\/components\/ui\/Modal|.*\/ui\/Modal)['"]/;

/** Either valid host for a Spectrum Dialog. */
const HOSTS = /DialogContainer|DialogTrigger/;

/**
 * Files that import `Modal` but are hosted by a PARENT, with the parent named.
 *
 * The parent is named rather than just excused: an entry saying which component
 * provides the host stays checkable — the test below verifies that parent really
 * does render this file's component AND really does host it. A bare filename would
 * become folklore the first time nobody could remember why it was listed.
 */
const HOSTED_BY_PARENT: Record<string, string> = {
    'AiCapabilitiesModal.tsx': 'ProjectDashboardScreen.tsx',
    'PromptEditDialog.tsx': 'AiOverviewScreen.tsx',
};

/** Every .ts/.tsx file under src/. */
function sourceFiles(dir: string, found: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            sourceFiles(full, found);
        } else if (/\.tsx?$/.test(entry.name)) {
            found.push(full);
        }
    }
    return found;
}

/** The files that import `core/ui/Modal`, excluding Modal itself. */
function modalConsumers(): { file: string; name: string; source: string }[] {
    return sourceFiles(SRC)
        .filter((file) => !file.endsWith(path.join('ui', 'Modal.tsx')))
        .map((file) => ({ file, name: path.basename(file), source: fs.readFileSync(file, 'utf8') }))
        .filter((entry) => IMPORTS_MODAL.test(entry.source));
}

describe('SOP: Modal hosting', () => {
    it('finds the modal consumers at all — the check is pointed somewhere real', () => {
        // A positive control. Without it, a broken path or a changed import
        // spelling makes every assertion below pass over an EMPTY list, which is
        // the exact "clean result from a check that never ran" this repo keeps
        // getting bitten by.
        expect(modalConsumers().length).toBeGreaterThan(5);
    });

    it('hosts every Modal in a DialogContainer or DialogTrigger', () => {
        const unhosted = modalConsumers()
            .filter(({ source }) => !HOSTS.test(source))
            .filter(({ name }) => !HOSTED_BY_PARENT[name])
            .map(({ file }) => path.relative(SRC, file));

        expect(unhosted).toEqual([]);
    });

    describe('the allowlist stays true', () => {
        it('names a parent that exists, renders the child, and is itself hosted', () => {
            const files = sourceFiles(SRC);
            const broken: string[] = [];

            for (const [child, parent] of Object.entries(HOSTED_BY_PARENT)) {
                const parentPath = files.find((f) => path.basename(f) === parent);
                if (!parentPath) {
                    broken.push(`${child}: parent ${parent} no longer exists`);
                    continue;
                }
                const parentSource = fs.readFileSync(parentPath, 'utf8');
                const childComponent = child.replace(/\.tsx?$/, '');
                if (!parentSource.includes(childComponent)) {
                    broken.push(`${child}: ${parent} no longer renders it`);
                }
                if (!HOSTS.test(parentSource)) {
                    broken.push(`${child}: ${parent} no longer provides a host`);
                }
            }

            expect(broken).toEqual([]);
        });

        it('lists nothing that now hosts itself', () => {
            // An exception that stopped being needed is noise, and noise is how an
            // allowlist turns into a place things go to be forgotten.
            const stale = modalConsumers()
                .filter(({ name }) => HOSTED_BY_PARENT[name])
                .filter(({ source }) => HOSTS.test(source))
                .map(({ name }) => name);

            expect(stale).toEqual([]);
        });
    });
});
