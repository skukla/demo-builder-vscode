/**
 * SOP: every window is one of five layouts, and each layout is one component (owner, 2026-11-10,
 * Phase 1b of `.rptc/plans/datapack-simplification/overview.md`). Form, Confirm, Progress, Result
 * and Guide each own their width, spacing, text classes, button order and how they end; a caller
 * passes words and actions. So only those five components (and `Modal` itself) render `Modal`.
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

/** The five layout components: the only files that may render `Modal`. */
const LAYOUTS = [
    'src/core/ui/components/ui/FormDialog.tsx',
    'src/core/ui/components/ui/ConfirmActionDialog.tsx',
    'src/core/ui/components/ui/ProgressDialog.tsx',
    'src/core/ui/components/ui/ResultDialog.tsx',
    'src/core/ui/components/ui/GuideDialog.tsx',
];

/** Files that render `Modal` directly today, each with the change that moves it. Shrink only. */
const LEDGER: Readonly<Record<string, string>> = {
    'src/features/data-installer/ui/components/PackSetupStepDialog.tsx':
        'waits for a layout: a Guide of one step with Open Admin and Check, and GuideDialog takes no actions',
    'src/features/data-installer/ui/components/LoadDatapackFileModal.tsx':
        'waits for a layout: its result holds two Delete buttons with their own wait and note, and ResultDialog takes one action',
    'src/features/data-installer/ui/components/ImportDatapackModal.tsx':
        'waits for a layout: one window through form, check, run and result at M, L or wide with start buttons',
    'src/features/data-installer/ui/components/ClearDemoDataModal.tsx':
        'waits for a layout: a Form at L for its store rows and preview, and FormDialog is M only',
    'src/features/data-installer/ui/components/create-flow/DatapackFlowDialog.tsx':
        'waits for a layout: a staged Form with Back, a start button and two commits at L or wide',
    'src/features/dashboard/ui/components/IntegrationSettingsModal.tsx':
        'waits for a layout: a Form whose failure shows an error status and whose Cancel becomes Run in Background while it saves',
    'src/features/dashboard/ui/components/ManageApisModal.tsx':
        'waits for a layout: a Form at L whose title, status and action change with each view, and FormDialog is M only',
    'src/features/dashboard/ui/components/AssignErpProductsModal.tsx':
        'waits for a layout: a Form at L wide for its product list, and FormDialog is M only',
    'src/features/dashboard/ui/components/ErpDowntimeDialog.tsx':
        'waits for a layout: a Form at S that reports its own failure with an error status, and FormDialog has no status',
    'src/features/dashboard/ui/components/integrations/PrepareOnAddConfirm.tsx':
        'waits for a layout: a Confirm at L that reads the store first, and ConfirmActionDialog is S with no wait',
    'src/features/dashboard/ui/components/integrations/SetupGuideModal.tsx':
        'waits for a layout: a Guide at L wide with a step list, start buttons and per step actions, and GuideDialog takes no actions',
    'src/features/dashboard/ui/components/AiCapabilitiesModal.tsx':
        'waits for a layout: a Guide at L with a Regenerate action, a wait and Run in Background, and GuideDialog takes no actions',
    'src/features/dashboard/ui/components/share/ShareModal.tsx':
        'waits for a layout: a Form at L with no submit, only Close, and FormDialog is M with a submit',
    'src/features/project-creation/ui/components/add-demo/AddDemoModal.tsx':
        'waits for a layout: a staged Form at L with Back, a start button and an answer with a status, and FormDialog is M with none',
    'src/features/project-creation/ui/components/add-demo/EditDemoPackageModal.tsx':
        'waits for a layout: a Form whose failure shows an error status and title, and FormDialog has no status',
    'src/features/project-creation/ui/components/integration-flow/AddIntegrationFlowModal.tsx':
        'waits for a layout: a staged Form at L with Back, a status per stage and a confirm in its own window',
    'src/features/projects-dashboard/ui/components/ProjectsBatchModal.tsx':
        'waits for a layout: one window through a two step Confirm with Back, a run with questions and a result, at L or wide',
    'src/features/projects-dashboard/ui/components/UpdatesModal.tsx':
        'waits for a layout: one window through a Form at L, a run with questions that hide Close, and a result with Back to Updates',
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

describe('one component per layout: only the five layouts render Modal', () => {
    const tsx = workingTreeFiles('src').filter((file) => file.endsWith('.tsx'));
    const direct = tsx.filter((file) => rendersModal(read(file)));

    it('CONTROL: found the layouts and the windows not yet moved', () => {
        expect(direct).toEqual(expect.arrayContaining(LAYOUTS));
        expect(direct.length).toBeGreaterThan(LAYOUTS.length);
    });

    it('a file outside the five layouts that renders Modal is in the ledger', () => {
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
