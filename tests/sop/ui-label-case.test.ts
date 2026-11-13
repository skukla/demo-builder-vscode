/**
 * SOP: what names a thing is Title Case, across the extension's own UI (owner, 2026-11-02: "I don't
 * like sentence case. I don't think it goes with professional applications." It should "apply
 * everywhere"). A title, button, tab, menu item, heading or field label reads "Run in Background".
 * What tells the SC something keeps normal capitals: a sentence, or a status note like "3 selected".
 *
 * Over every webview bundle, reached from `WEBVIEW_ENTRIES` in `esbuild.config.js` by the compiler's
 * own module graph, so a file no bundle imports is not read and a new bundle cannot be missed.
 *
 * An exception goes in the ledger with its reason. A string the scan cannot read is counted against a
 * pin, not passed: that number going up means a label stopped being checkable.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { firstNonTitleWord, type LabelSite, scanPlanted, scanSources } from './uiLabelCase.scan';

const ROOT = join(__dirname, '..', '..');

type Reason = 'complete-sentence' | 'inside-a-sentence' | 'status-note' | 'user-or-product-text';

/** A string the rule does not apply to, by its text, with why. */
const LEDGER: Readonly<Record<string, Reason>> = {
    'Something went wrong': 'complete-sentence',
    'Removal stopped': 'status-note',
    'project configuration': 'inside-a-sentence',
    // Clear Commerce Instance's confirmation box (step 06 C4, decisions J1-5): the SC states a fact
    // in the first person before the red button turns on. Read since C5 gave the window its host.
    'I understand every project on these websites loses its data': 'complete-sentence',
};

/**
 * Strings in a naming position the compiler cannot read: props and runtime values. Shrink only.
 * 70 -> 71 on 2026-11-04 (raised for the owner to confirm): the projects batch window's title is
 * a run's question's own heading while it asks ("Sign In to DA.live"), which arrives from the
 * extension at run time. 71 -> 69 on 2026-11-08, with the waits' rework (`WAIT_STAGES`) and the
 * import pause taken out: two fewer strings the scan cannot read. 69 -> 70 on 2026-11-09: Version
 * History's radio choices are each a save's date ("Nov 9, 1:56 PM", `versionLabel`), which no
 * Title Case rule applies to (walk F99). 70 -> 68 on 2026-11-10 (Phase 1b): a layout's forwarding of
 * its caller's words is no longer counted (`forwardedByALayout`); ConfirmActionDialog's two were.
 * 68 -> 66 on 2026-11-12 (step 03, S7): the old import window went, with three runtime strings in
 * its form and its removal confirm; one came in, the job window's question button, which is its
 * verb (`DatapackVerb`: Install, Uninstall or Switch).
 * 66 -> 64 on 2026-11-13 (step 06, C2a): Clear Demo Data's store picker went (`StorePickList`), with
 * its two runtime labels, a website's name and a store's name.
 * 64 -> 66 on 2026-11-13 (step 06, C5): Clear Commerce Instance's window joined the bundle with the
 * header's Clear menu, and with it the website list's two runtime labels (`CheckboxRow.label`, a
 * website's name or, without one, its code): Commerce's own words for the SC's websites.
 */
const DYNAMIC_PIN = 66;

/**
 * The six dialog layouts (the Steps layout joined 2026-11-11) hand their caller's words on to Modal (`title={title}`). Those words are
 * read where the caller writes them (`ProgressDialog.title`, `FormDialog.submitLabel`, ...), so the
 * layout's own forwarding is not one more string the scan cannot read. A literal inside a layout
 * is still checked like any other.
 */
const LAYOUT_FILES: ReadonlySet<string> = new Set([
    ...['ConfirmActionDialog', 'FormDialog', 'ProgressDialog', 'ResultDialog', 'GuideDialog', 'StepsDialog'].map(
        (name) => `src/core/ui/components/ui/${name}.tsx`
    ),
    // The save question's frame over the Steps layout (step-05, R2): its two button labels are its
    // caller's, read where the caller writes them (`SaveFirstWindow.saveLabel`, ...).
    'src/core/ui/components/feedback/SaveFirstWindow.tsx',
]);

const forwardedByALayout = (site: LabelSite): boolean =>
    site.text === undefined && LAYOUT_FILES.has(site.file);

/** A positive control: well below this, the scan has stopped finding the sites. */
const MINIMUM_SITES = 300;

function webviewEntries(): string[] {
    const config = readFileSync(join(ROOT, 'esbuild.config.js'), 'utf8');
    const block = /const WEBVIEW_ENTRIES = \{([\s\S]*?)\n\};/.exec(config)?.[1] ?? '';
    return [...block.matchAll(/^\s*\w+:\s*'([^']+\.tsx?)'/gm)].map((match) => join(ROOT, match[1]));
}

function scanBundles(): LabelSite[] {
    const parsed = ts.parseJsonConfigFileContent(
        ts.readConfigFile(join(ROOT, 'tsconfig.json'), ts.sys.readFile).config,
        ts.sys,
        ROOT
    );
    const program = ts.createProgram(webviewEntries(), {
        ...parsed.options,
        noEmit: true,
        skipLibCheck: true,
    });
    const sources = program
        .getSourceFiles()
        .filter((file) => file.fileName.startsWith(join(ROOT, 'src')) && !file.isDeclarationFile);
    return scanSources(sources, program.getTypeChecker(), ROOT);
}

function wizardStepSites(): LabelSite[] {
    const file = 'src/features/project-creation/config/wizard-steps.json';
    const steps = (
        JSON.parse(readFileSync(join(ROOT, file), 'utf8')) as { steps: Array<{ name: string }> }
    ).steps;
    return steps.map((step) => ({ file, line: 0, position: 'wizard-steps.name', text: step.name }));
}

/** The field labels the Configure screen and the wizard draw from the component catalog. */
function catalogLabelSites(): LabelSite[] {
    const file = 'src/features/components/config/components.json';
    const { envVars } = JSON.parse(readFileSync(join(ROOT, file), 'utf8')) as {
        envVars: Record<string, { label?: string }>;
    };
    return Object.values(envVars).flatMap((envVar) =>
        envVar.label ? [{ file, line: 0, position: 'envVars.label', text: envVar.label }] : []
    );
}

const breaks = (
    site: LabelSite,
    ledger: Readonly<Record<string, Reason>> = LEDGER
): string | undefined =>
    site.text === undefined || site.text in ledger ? undefined : firstNonTitleWord(site.text);

describe('Title Case for what names a thing', () => {
    let sites: LabelSite[];

    beforeAll(() => {
        sites = [...scanBundles(), ...wizardStepSites(), ...catalogLabelSites()];
    }, 180_000);

    it('reads every webview bundle, by the build list', () => {
        expect(webviewEntries().length).toBeGreaterThanOrEqual(8);
    });

    it('CONTROL: found the real sites: a broken scan must not read as clean', () => {
        expect(sites.filter((site) => site.text !== undefined).length).toBeGreaterThan(
            MINIMUM_SITES
        );
        expect(sites.map((site) => site.text)).toEqual(
            expect.arrayContaining(['Run in Background', 'Install from File', 'Build Your Project'])
        );
    });

    it('every readable name is Title Case, or in the ledger with its reason', () => {
        const offenders = sites
            .filter((site) => breaks(site))
            .map((site) => `${site.file}:${site.line} ${site.position}: ${site.text}`);

        expect(offenders).toStrictEqual([]);
    });

    it('holds the unreadable names to their pin, so one more cannot slip in unchecked', () => {
        expect(sites.filter((site) => site.text === undefined && !forwardedByALayout(site))).toHaveLength(DYNAMIC_PIN);
    });

    it('carries no ledger row for a string that has gone', () => {
        const seen = new Set(sites.map((site) => site.text));

        expect(Object.keys(LEDGER).filter((text) => !seen.has(text))).toStrictEqual([]);
    });
});

/** The real reader over planted source: each defect must fail, and each control must pass. */
describe('the scan catches what it says it catches', () => {
    const flagged = (source: string, ledger: Readonly<Record<string, Reason>> = {}): string[] =>
        scanPlanted(source)
            .filter((site) => breaks(site, ledger))
            .map((site) => `${site.position}: ${site.text}`);

    it.each([
        ['a button', '<Button>Save changes</Button>', '<Button>: Save changes'],
        [
            'a Text inside a button',
            '<Button><Text>Save changes</Text></Button>',
            '<Button>: Save changes',
        ],
        ['a modal title', '<Modal title="Clear demo data" />', 'Modal.title: Clear demo data'],
        [
            'a close label',
            '<Modal closeLabel="Run in background" />',
            'Modal.closeLabel: Run in background',
        ],
        ['a field label', '<FormField label="Datapack name" />', 'FormField.label: Datapack name'],
        [
            'a section label',
            '<SectionLabel>Start from</SectionLabel>',
            '<SectionLabel>: Start from',
        ],
        [
            'a plain label by class',
            '<span className="datapack-import-label">Data types</span>',
            '<datapack-import-label>: Data types',
        ],
        [
            'a menu item',
            'const row = { key: "a", label: "Save as file", icon: "save" };',
            'object.label: Save as file',
        ],
        [
            'an action button',
            'const b = { label: "Mark as done", variant: "accent", onPress: f };',
            'object.label: Mark as done',
        ],
        [
            'a button whose text is a local constant',
            'const label = on ? "Stop sharing" : "Share"; <Button>{label}</Button>',
            '<Button>: Stop sharing',
        ],
        [
            'a conditional inside a button',
            '<Button>{on ? "Stop sharing" : "Share"}</Button>',
            '<Button>: Stop sharing',
        ],
        ['words beside an icon', '<Button><Icon />Save changes</Button>', '<Button>: Save changes'],
        [
            'a Text one side of a conditional',
            '<Button>{on ? <Text>Save changes</Text> : <Spinner />}</Button>',
            '<Button>: Save changes',
        ],
        [
            'a function with several returns',
            'function titleOf(failed: boolean) { if (failed) return "Could not save"; return "Fine Title"; } <Modal title={titleOf(x)} />',
            'Modal.title: Could not save',
        ],
        [
            'a constant table',
            'const TITLES = { a: "Fine Title", b: "Add a demo" }; <Modal title={TITLES[mode]} />',
            'Modal.title: Add a demo',
        ],
        [
            'a label handed over by name',
            'const label = n ? "Apply 1 update" : "Fine"; const b = { label, variant: "accent", onPress: f };',
            'object.label: Apply 1 update',
        ],
        [
            'a run title',
            'const r = { title: "Syncing the store", failureTitle: "Couldn\'t Sync", successTitle: "Synced" };',
            'object.title: Syncing the store',
        ],
    ])('fails %s', (_what, source, expected) => {
        expect(flagged(source)).toContain(expected);
    });

    // A real pre-change string, read from the tree before this rule (`08f0cdc5c`,
    // src/core/ui/components/feedback/OperationProgressModal.tsx).
    it('fails a string this repo actually shipped', () => {
        const replay =
            "const closeOf = (ended: boolean) => (ended ? 'Close' : 'Run in background'); <Modal closeLabel={ended ? 'Close' : 'Run in background'} />";

        expect(flagged(replay)).toContain('Modal.closeLabel: Run in background');
    });

    it('follows a constant, a copy object, a function on one, and both sides of a conditional', () => {
        const source = `
            const TITLE = 'Clear demo data';
            const COPY = { failed: "Couldn't read the stores", named: (n: string) => \`Assign products to \${n}\` };
            const a = <Modal title={TITLE} />;
            const b = <Modal title={failed ? COPY.failed : 'Fine Title'} />;
            const c = <Modal title={COPY.named('x')} />;
        `;

        expect(flagged(source)).toEqual([
            'Modal.title: Clear demo data',
            "Modal.title: Couldn't read the stores",
            'Modal.title: Assign products to ${}',
        ]);
    });

    it('counts what it cannot read instead of passing it', () => {
        const dynamic = scanPlanted('const a = <Modal title={props.title} />;');

        expect(dynamic).toEqual([expect.objectContaining({ position: 'Modal.title' })]);
        expect(dynamic[0].text).toBeUndefined();
    });

    it.each([
        ['Title Case', '<Button>Run in Background</Button>'],
        ['small words in the middle', '<Modal title="Sign In to the Store" />'],
        ['a capital on a last small word', '<FormField label="Connected To" />'],
        ['a value in the name', '<Modal title={`Remove ${name} Anyway?`} />'],
        ['an identifier', '<Modal title="Add erp_owner to Attribute Sets?" />'],
        ['a product name', '<Button>Open DA.live</Button>'],
        ['a hyphenated word', '<Modal title="Pre-Built Integration" />'],
        ['a sentence in a position that is not a name', '<p>this is a plain sentence</p>'],
    ])('passes %s', (_what, source) => {
        expect(flagged(source)).toStrictEqual([]);
    });

    it.each<[Reason, string]>([
        ['complete-sentence', 'This file cannot be loaded'],
        ['status-note', 'Not set up'],
        ['user-or-product-text', 'aio login'],
    ])('passes a ledger row for a %s, and only with the row', (reason, text) => {
        const source = `<Modal title="${text}" />`;

        expect(flagged(source)).toHaveLength(1);
        expect(flagged(source, { [text]: reason })).toStrictEqual([]);
    });
});
