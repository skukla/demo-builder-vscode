/**
 * A modal does not change size while it works (owner, 2026-09-20).
 *
 * The Data Installer's import modal was three different heights in one dry run: the
 * form, then the spinner, then "Dry run passed". Each state is a different amount of
 * content and nothing held a floor under them, so the whole dialog jumped twice
 * while the SC watched it work.
 *
 * A modal is at risk when its body renders DIFFERENT views — a form, a spinner, a
 * result. Three things hold a floor, and one of them has to be there:
 *
 *   `SteadyHeight`               the tallest state so far, measured
 *   `modal-progress-body`        one fixed height, for a body whose states are known
 *   `CenteredFeedbackContainer`  a height the caller names
 *
 * What this cannot see: whether the floor is the RIGHT height. That is a judgement,
 * and the ledger is where a modal that legitimately has none says so.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '..', '..');
const LEDGER: { _what: string; noViewsOfItsOwn: Record<string, string> } = JSON.parse(
    readFileSync(join(__dirname, 'modal-steady-height.ledger.json'), 'utf8'),
);

/** A body that switches on which view it is showing. */
const BRANCH = /(view === |phase === |state === |stage === |step === |mode === )/g;

/**
 * The three ways a modal body holds a floor under its states, as they appear when
 * they are USED. Matching the bare names would match the import line too — which the
 * first version did, so deleting the floor and leaving the import passed the check.
 */
const HOLDS = [/<SteadyHeight[\s>]/, /modal-progress-body/, /<CenteredFeedbackContainer[\s>]/];

const COMPONENTS = execSync('git ls-files src', { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.tsx'));

interface Modal {
    file: string;
    branches: number;
    holds: boolean;
}

/** The sibling modules this file imports, as repo paths that exist on disk. */
function localImports(file: string, source: string): string[] {
    const dir = file.slice(0, file.lastIndexOf('/'));
    const specs = [...source.matchAll(/from\s+'(\.[^']+)'/g)].map((m) => m[1]);
    return specs
        .map((spec) => `${dir}/${spec.replace(/^\.\//, '')}`)
        .flatMap((base) => [`${base}.tsx`, `${base}.ts`])
        .filter((candidate) => existsSync(join(ROOT, candidate)));
}

/** The source minus its imports: a floor imported and never rendered is not a floor. */
function withoutImports(source: string): string {
    return source
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('import'))
        .join('\n');
}

/** Every component that renders a Modal and switches between views inside it. */
function modalsWithViews(): Modal[] {
    const found: Modal[] = [];
    for (const file of COMPONENTS) {
        const source = readFileSync(join(ROOT, file), 'utf8');
        if (!source.includes('<Modal')) continue;
        const branches = (source.match(BRANCH) ?? []).length;
        if (branches < 2) continue;
        // A body big enough to live in its own module still holds the floor — it
        // just holds it one file along. Follow a locally-imported component before
        // calling this modal unheld, or splitting a long component (which this repo
        // asks for elsewhere) would break a rule it kept.
        const holds =
            HOLDS.some((h) => h.test(withoutImports(source))) ||
            localImports(file, source).some((near) =>
                HOLDS.some((h) => h.test(withoutImports(readFileSync(join(ROOT, near), 'utf8')))),
            );
        found.push({ file, branches, holds });
    }
    return found;
}

describe('a modal does not change size while it works', () => {
    const modals = modalsWithViews();

    it('CONTROL: the scan finds the modals this extension actually shows', () => {
        expect(COMPONENTS.length).toBeGreaterThan(100);
        expect(modals.length).toBeGreaterThan(2);
        // The one that jumped, and the one that never did.
        expect(modals.map((m) => m.file)).toEqual(
            expect.arrayContaining([
                'src/features/data-installer/ui/components/ImportDatapackModal.tsx',
                'src/core/ui/components/feedback/OperationProgressModal.tsx',
            ]),
        );
    });

    // A control that only proves the scan READ something is not a proof. This one
    // ran green while the check was blind: it matched the bare name `SteadyHeight`,
    // which the IMPORT line carries, so deleting the floor and leaving the import
    // passed. Both directions are asserted now, against synthetic sources, because
    // the tree cannot be relied on to hold an example of the defect.
    it('CONTROL: it can tell a floor that is rendered from one merely imported', () => {
        const held = `import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
            <Modal><SteadyHeight className="b">{body}</SteadyHeight></Modal>`;
        const imported = `import { SteadyHeight } from '@/core/ui/components/layout/SteadyHeight';
            <Modal><div className="b">{body}</div></Modal>`;

        expect(HOLDS.some((h) => h.test(withoutImports(held)))).toBe(true);
        expect(HOLDS.some((h) => h.test(withoutImports(imported)))).toBe(false);
    });

    it('CONTROL: a real modal that holds a floor reads as holding one', () => {
        const progress = modals.find((m) => m.file.endsWith('OperationProgressModal.tsx'));
        expect(progress?.holds).toBe(true);
    });

    it('every one holds a floor under its states, or says why it needs none', () => {
        const unheld = modals.filter((m) => !m.holds).map((m) => m.file);
        const listed = Object.keys(LEDGER.noViewsOfItsOwn);

        const unexplained = unheld.filter((file) => !listed.includes(file));
        const stale = listed.filter((file) => !unheld.includes(file));
        const thinReasons = Object.entries(LEDGER.noViewsOfItsOwn)
            .filter(([, reason]) => reason.trim().length < 25)
            .map(([file]) => file);

        expect({ unexplained, stale, thinReasons }).toEqual({
            unexplained: [],
            stale: [],
            thinReasons: [],
        });
    });
});
