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
 * The incident: the datapack import modal shipped with neither host and never rendered
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

/**
 * How `core/ui/Modal` is imported, by either spelling. Not `import type`: a file that takes
 * only Modal's `ActionButton` type renders no Modal, so it has nothing to host
 * (`setupGuideFooter.ts`, 2026-10-26). And `Modal` itself among the names: a file that takes only
 * `DialogButton`, a footer-style button in a window's body, renders no window either (Share Demo's
 * datapack notice, walk F237).
 */
const IMPORTS_MODAL = /^import\s+(?!type\b)\{[^}]*\bModal\b[^}]*\}\s*from\s+['"](?:@\/core\/ui\/components\/ui\/Modal|.*\/ui\/Modal)['"]/m;

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
    'AiCapabilitiesModal.tsx': 'DashboardDialogs.tsx',
    // The ERP add's "prepare the store", shown in the Add Integration flow's own container
    // through its `confirmation` slot (owner, 2026-10-31: one window, not a second dialog).
    'PrepareOnAddConfirm.tsx': 'AddIntegrationFlowModal.tsx',
    // A datapack job's phases: one window at a time in the job's own container (step 03), found
    // when the check began reading layout windows (step-07 Win5).
    'RestorePhase.tsx': 'DatapackJobWindow.tsx',
    'ResultPhase.tsx': 'DatapackJobWindow.tsx',
    'RunPhase.tsx': 'DatapackJobWindow.tsx',
    'SummaryPhase.tsx': 'DatapackJobWindow.tsx',
    'UpdateSummary.tsx': 'DatapackJobWindow.tsx',
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
    it('CONTROL: finds the modal consumers at all — the check is pointed somewhere real', () => {
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

        expect(unhosted).toStrictEqual([]);
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

            expect(broken).toStrictEqual([]);
        });

        it('lists nothing that now hosts itself', () => {
            // An exception that stopped being needed is noise, and noise is how an
            // allowlist turns into a place things go to be forgotten.
            const stale = [...modalConsumers(), ...windowScan().consumers]
                .filter(({ name }) => HOSTED_BY_PARENT[name])
                .filter(({ source }) => HOSTS.test(source))
                .map(({ name }) => name);

            expect(stale).toStrictEqual([]);
        });
    });
});

/**
 * The same contract one level up (step-07 Win5). A layout's `*Window` export (`StepsWindow`,
 * `ResultWindow`, `ConfirmActionWindow`) is its Modal WITHOUT the container, for a host that already
 * holds one. It imports nothing from `Modal`, so the check above never saw it: a bare StepsWindow
 * rendered nothing and passed. A component named `*Window` that renders one without a host
 * (`SaveFirstWindow`) is a window too, transitively; any OTHER file that renders a window must host
 * it, or be listed in `HOSTED_BY_PARENT` with the parent that does.
 */
const LAYOUT_DIR = path.join(SRC, 'core', 'ui', 'components', 'ui');

/** A layout file: one of the six in `core/ui/components/ui` (`tests/sop/modal-layouts.test.ts`). */
const isLayoutFile = (file: string): boolean =>
    path.dirname(file) === LAYOUT_DIR && /Dialog\.tsx$/.test(file);

/** The source without its comments, so a window NAMED in a docstring is not read as rendered. */
const code = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

/** True when the source renders `<name` as an element. */
export function rendersElement(source: string, name: string): boolean {
    return new RegExp(`<${name}(?=[\\s>/])`).test(code(source));
}

interface Scanned {
    file: string;
    name: string;
    source: string;
}

/**
 * The windows, and the files that render one without being one.
 *
 * @param files - the sources to read (all of `src/` by default; a planted set in the self-test)
 * @returns `windows`: component name to its file, layouts' exports included; `consumers`: every
 *   other file that renders a window
 */
export function windowScan(files: Scanned[] = tsxSources()): {
    windows: Map<string, string>;
    consumers: Scanned[];
} {
    const windows = new Map<string, string>();
    for (const entry of files.filter(({ file }) => isLayoutFile(file))) {
        for (const match of entry.source.matchAll(/^export function (\w+Window)\b/gm)) {
            windows.set(match[1], entry.file);
        }
    }
    const rendersWindow = (source: string): boolean =>
        [...windows.keys()].some((name) => rendersElement(source, name));
    let grew = true;
    while (grew) {
        grew = false;
        for (const entry of files) {
            const component = entry.name.replace(/\.tsx$/, '');
            const isWindow = /Window$/.test(component) && !isLayoutFile(entry.file);
            if (!isWindow || windows.has(component) || HOSTS.test(entry.source)) continue;
            if (rendersWindow(entry.source)) {
                windows.set(component, entry.file);
                grew = true;
            }
        }
    }
    const consumers = files.filter(
        ({ file, name }) =>
            !isLayoutFile(file) &&
            windows.get(name.replace(/\.tsx$/, '')) !== file &&
            rendersWindow(fs.readFileSync(file, 'utf8')),
    );
    return { windows, consumers };
}

/** Every .tsx file under src/, read. */
function tsxSources(): Scanned[] {
    return sourceFiles(SRC)
        .filter((file) => file.endsWith('.tsx'))
        .map((file) => ({ file, name: path.basename(file), source: fs.readFileSync(file, 'utf8') }));
}

describe('SOP: a window built on a layout is hosted', () => {
    const { windows, consumers } = windowScan();

    it('CONTROL: finds the layouts\' windows, a window built on one, and their consumers', () => {
        expect([...windows.keys()]).toEqual(
            expect.arrayContaining(['StepsWindow', 'ResultWindow', 'ConfirmActionWindow', 'SaveFirstWindow']),
        );
        expect(consumers.length).toBeGreaterThan(5);
    });

    it('hosts every window in a DialogContainer or DialogTrigger, or names the parent that does', () => {
        const unhosted = consumers
            .filter(({ source }) => !HOSTS.test(source))
            .filter(({ name }) => !HOSTED_BY_PARENT[name])
            .map(({ file }) => path.relative(SRC, file));

        expect(unhosted).toStrictEqual([]);
    });

    it('gives every window built on a layout a file that renders it', () => {
        const all = tsxSources();
        const orphans = [...windows.entries()]
            .filter(([, file]) => !isLayoutFile(file))
            .filter(([name, file]) => !all.some((entry) => entry.file !== file && rendersElement(entry.source, name)))
            .map(([name]) => name);

        expect(orphans).toStrictEqual([]);
    });
});
