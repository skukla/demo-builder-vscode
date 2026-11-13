/**
 * SOP: every window is one of six layouts, and each layout is one component (owner, 2026-11-10,
 * Phase 1b of `.rptc/plans/datapack-simplification/overview.md`). Form, Confirm, Progress, Result,
 * Guide and Steps each own their width, spacing, text classes, button order and how they end; a
 * caller passes words and actions. So only those six components (and `Modal` itself) render
 * `Modal`. Steps (2026-11-11) is the window that goes Form, Running, Result at one fixed height.
 *
 * Every file that renders `Modal` directly today is in the ledger, each with the feature whose
 * migration moves it. The ledger only shrinks: a file not in it fails, and a row for a file that no
 * longer renders `Modal` fails too, so a migrated window cannot keep its exemption.
 *
 * The second half is the stylesheet: the 60-character line, the 16px lead and Spectrum's button
 * weight live in `src/core/ui/styles`, and no feature stylesheet sets `max-width`, `font-size` or
 * `font-weight` on `.lead-text`, `.dialog-line` or `.modal-button`.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { workingTreeFiles } from './architectureScan';

const ROOT = join(__dirname, '..', '..');

/** The six layout components: the only files that may render `Modal`. */
const LAYOUTS = [
    'src/core/ui/components/ui/FormDialog.tsx',
    'src/core/ui/components/ui/ConfirmActionDialog.tsx',
    'src/core/ui/components/ui/ProgressDialog.tsx',
    'src/core/ui/components/ui/ResultDialog.tsx',
    'src/core/ui/components/ui/GuideDialog.tsx',
    'src/core/ui/components/ui/StepsDialog.tsx',
];

/** Files that render `Modal` directly today, each with the change that moves it. Shrink only. */
const LEDGER: Readonly<Record<string, string>> = {
    'src/features/dashboard/ui/components/integrations/SetupGuideModal.tsx':
        'waits for a layout: a Guide at L wide with the step list beside the chosen step, list buttons at the footer start and the step buttons on the right; GuideDialog draws one column of rows, each with its own buttons',
    'src/features/dashboard/ui/components/share/ShareModal.tsx':
        'waits for the owner (Phase 1b question): two forms whose buttons sit in the body and whose notes and details grow it; a Steps window holds one height, so they would scroll',
    'src/features/project-creation/ui/components/add-demo/AddDemoModal.tsx':
        'waits for the owner (Phase 1b question): stages of different heights; a Steps window holds the first stage, so the taller found stage scrolls, unless each stage is its own window',
    'src/features/project-creation/ui/components/integration-flow/AddIntegrationFlowModal.tsx':
        'waits for the owner (Phase 1b question): five stages of five heights; a Steps window holds the first stage, so the API and project lists scroll, unless each stage is its own window',
    'src/features/projects-dashboard/ui/components/ProjectsBatchModal.tsx':
        'the read, the questions and the save question are already Steps windows; the run waits for a layout: rows at L or wide, a question under its row that hides Close, then the small result; ProgressDialog is M and cannot hide Close',
    'src/features/projects-dashboard/ui/components/UpdatesModal.tsx':
        'waits for a layout: one window through the update list, a run whose questions hide Close or take the window, and a small result with Back to Updates; ProgressDialog is M and cannot hide Close',
};

/** Feature stylesheets that set a layout's text or weight today, with why. Shrink only. */
const STYLE_LEDGER: Readonly<Record<string, string>> = {};

const RENDERS_MODAL = /<Modal(?=[\s>/])/;

/** True when the source renders `Modal` as an element. */
export function rendersModal(source: string): boolean {
    return RENDERS_MODAL.test(source);
}

const OWNED_CLASS = /\.(lead-text|dialog-line|modal-button)(?![\w-])/;
const OWNED_PROPERTY = /(^|[;{\s])(max-width|font-size|font-weight)\s*:/;

/**
 * The selectors in a stylesheet that set one of the owned properties on one of the owned classes.
 *
 * @param css - a stylesheet's text
 * @returns each offending selector
 */
export function ownedTextRules(css: string): string[] {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const out: string[] = [];
    for (const match of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = match[1].trim();
        if (OWNED_CLASS.test(selector) && OWNED_PROPERTY.test(match[2])) out.push(selector);
    }
    return out;
}

const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

describe('one component per layout: only the six layouts render Modal', () => {
    const tsx = workingTreeFiles('src').filter((file) => file.endsWith('.tsx'));
    const direct = tsx.filter((file) => rendersModal(read(file)));

    it('CONTROL: found the layouts and the windows not yet moved', () => {
        expect(direct).toEqual(expect.arrayContaining(LAYOUTS));
        expect(direct.length).toBeGreaterThan(LAYOUTS.length);
    });

    it('a file outside the six layouts that renders Modal is in the ledger', () => {
        const offenders = direct.filter((file) => !LAYOUTS.includes(file) && !(file in LEDGER));

        expect(offenders).toStrictEqual([]);
    });

    it('carries no ledger row for a file that no longer renders Modal', () => {
        expect(Object.keys(LEDGER).filter((file) => !direct.includes(file))).toStrictEqual([]);
    });

    it('gives every ledger row its reason', () => {
        const thin = Object.entries(LEDGER).filter(([, reason]) => reason.length < 25);

        expect(thin).toStrictEqual([]);
    });
});

describe('the line, the lead and the button weight live in the shared stylesheet', () => {
    const sheets = workingTreeFiles('src').filter(
        (file) => file.endsWith('.css') && !file.startsWith('src/core/ui/styles/')
    );
    const offenders = sheets.flatMap((file) =>
        ownedTextRules(read(file)).map((selector) => `${file}: ${selector}`)
    );

    it('CONTROL: the shared stylesheet itself sets them, so the reader finds a real rule', () => {
        expect(sheets.length).toBeGreaterThan(5);
        expect(ownedTextRules(read('src/core/ui/styles/modal.css'))).toEqual(
            expect.arrayContaining(['.lead-text,\n.dialog-line', '.modal-button'])
        );
    });

    it('no feature stylesheet sets max-width, font-size or font-weight on them', () => {
        expect(offenders.filter((line) => !(line.split(':')[0] in STYLE_LEDGER))).toStrictEqual([]);
    });

    it('carries no stylesheet ledger row that has gone', () => {
        const files = new Set(offenders.map((line) => line.split(':')[0]));

        expect(Object.keys(STYLE_LEDGER).filter((file) => !files.has(file))).toStrictEqual([]);
    });
});

/** The real readers over planted source: each defect must fail, and each control must pass. */
describe('the scans catch what they say they catch', () => {
    it.each([
        ['a self-closing Modal', '<Modal title="Save" />'],
        ['a Modal with props on the next line', '<Modal\n    title="Save"\n>'],
        ['a bare Modal', '<Modal>body</Modal>'],
    ])('flags %s', (_what, source) => {
        expect(rendersModal(source)).toBe(true);
    });

    it.each([
        ['a layout component', '<ResultDialog title="Saved" />'],
        ['a component whose name starts with Modal', '<ModalBody />'],
        ['an import alone', "import { Modal } from '@/core/ui/components/ui/Modal';"],
    ])('passes %s', (_what, source) => {
        expect(rendersModal(source)).toBe(false);
    });

    // A real rule this repo shipped before the shared rule took it over (modal.css, 2026-11-10).
    it('fails a feature rule giving the buttons a house weight', () => {
        expect(ownedTextRules('.share-footer .modal-button {\n    font-weight: 700;\n}')).toEqual([
            '.share-footer .modal-button',
        ]);
    });

    it.each([
        ['a width on a lead', '.batch-confirm > .lead-text { max-width: 480px; }'],
        ['a size on a line', '.dialog-line.ai-regen-error { margin: 0; font-size: 13px; }'],
    ])('fails %s', (_what, css) => {
        expect(ownedTextRules(css)).toHaveLength(1);
    });

    it.each([
        ['a margin on a lead', '.batch-confirm > .lead-text { margin: 0; }'],
        ['a size on another class', '.dialog-line-label { font-size: 12px; }'],
        ['a property in a comment', '.lead-text { /* font-size: 16px; */ margin: 0; }'],
    ])('passes %s', (_what, css) => {
        expect(ownedTextRules(css)).toStrictEqual([]);
    });
});
