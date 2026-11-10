/**
 * An import's run as steps (owner, 2026-11-09, `.rptc/research/replace-flow-steps/`): Save Your
 * Changes, Uninstall the Previous Version, Install, Verify Installation, only those that apply, in the
 * order they run. The data types are Install's own rows; the engine's work outside any one type is
 * a line on the step it serves, where Preparing Import and Finishing Import used to be rows.
 */

import {
    doingLine,
    importSteps,
    type ImportStep,
    type StepSource,
} from '@/features/data-installer/importSteps';
import { versionLabel } from '@/features/data-installer/packVersions';
import { FINISHING_STOP, type InstallCheck, LINKING_OPTIONS, REPLACE_STOP } from '@/features/data-installer/types';

const NONE_FOUND = { count: 0, examples: [] as string[] };

/** The engine's install check, as the record carries it: nothing found wrong. */
const CHECK: InstallCheck = {
    verdict: 'matches',
    checked: 2046,
    compared: { values: 120, prices: 40, configurables: 6 },
    missing: NONE_FOUND,
    configurablesWithoutOptions: NONE_FOUND,
    configurablesDiffer: { count: 0, examples: [] },
    valuesDiffer: { count: 0, examples: [] },
    pricesDiffer: { count: 0, examples: [] },
};

/** A first install of Luma's main version, running, before the first poll. */
const source = (over: Partial<StepSource> = {}): StepSource => ({
    perType: {},
    dataTypes: ['products', 'categories'],
    installing: { name: 'Luma', version: 'main' },
    running: true,
    ...over,
});

/** The demo's pack is an earlier save of the same pack: restoring from Version History. */
const SAVED = '20261109-135600';
const SAME_PACK: Partial<StepSource> = {
    installing: { name: 'Luma', version: SAVED },
    replaces: 'Luma',
    replacesVersion: 'Nov 1, 12:00 PM',
};

const labels = (steps: ImportStep[]): string[] => steps.map((step) => step.label);
const stepOf = (steps: ImportStep[], label: RegExp): ImportStep => {
    const step = steps.find((s) => label.test(s.label));
    if (!step) throw new Error(`no step matching ${label}`);
    return step;
};
const install = (steps: ImportStep[]): ImportStep => stepOf(steps, /^Install /);
const verify = (steps: ImportStep[]): ImportStep => stepOf(steps, /^Verify /);
const remove = (steps: ImportStep[]): ImportStep => stepOf(steps, /^Uninstall /);

describe('which steps show', () => {
    // A first install spins from the first frame, as Preparing Import's "Starting" did (helper's review).
    it('draws a first install as Install, spinning from the start, and Verify waiting', () => {
        const steps = importSteps(source());

        expect(labels(steps)).toStrictEqual(['Install Luma, main', 'Verify Installation']);
        expect(steps.map((step) => [step.status, step.line])).toStrictEqual([
            ['checking', 'Starting'],
            ['pending', 'Waiting'],
        ]);
    });

    it('puts the data types under Install, in install order, with none of the old end rows', () => {
        const types = install(importSteps(source())).types ?? [];

        expect(types.map((type) => type.label)).toStrictEqual(['Categories', 'Products']);
        expect(types.map((type) => type.kind)).not.toContain('preparing');
    });

    it('draws a replace that saved first as all four, in the order they run', () => {
        const steps = importSteps(
            source({ ...SAME_PACK, savedAs: 'Nov 9, 1:56 PM', replacing: 'pending' })
        );

        expect(labels(steps)).toStrictEqual([
            'Save Your Changes',
            'Uninstall the Previous Version',
            `Install the Version from ${versionLabel(SAVED)}`,
            'Verify Installation',
        ]);
        expect(steps[0]).toStrictEqual({
            kind: 'saving-changes',
            label: 'Save Your Changes',
            status: 'success',
            line: 'Saved as Nov 9, 1:56 PM',
        });
    });

    it('spins the save with its stage while the start waits on it', () => {
        const steps = importSteps(
            source({ replaces: 'Bodea, main', savingStage: 'Saving to the library' })
        );

        expect(steps[0]).toMatchObject({
            label: 'Save Your Changes',
            status: 'checking',
            line: 'Saving to the library',
        });
    });

    it('CONTROL: no save step when nothing was saved, or when nothing is replaced', () => {
        expect(labels(importSteps(source({ replaces: 'Bodea, main' })))).not.toContain(
            'Save Your Changes'
        );
        expect(labels(importSteps(source({ savingStage: 'Saving to the library' })))).not.toContain(
            'Save Your Changes'
        );
    });
});

describe('what Install and Remove are named', () => {
    it('names another version of the same pack by when it was saved', () => {
        const steps = importSteps(source(SAME_PACK));

        expect(remove(steps).label).toBe('Uninstall the Previous Version');
        expect(install(steps).label).toBe(`Install the Version from ${versionLabel(SAVED)}`);
    });

    it('names another pack by its name, and its version when it is not a save', () => {
        const steps = importSteps(source({ replaces: 'Bodea, main' }));

        expect(remove(steps).label).toBe('Uninstall the Previous Datapack');
        expect(install(steps).label).toBe('Install Luma, main');
    });

    it('leaves a save’s dated version out of the pack’s name', () => {
        const steps = importSteps(source({ installing: { name: 'My Luma', version: SAVED } }));

        expect(install(steps).label).toBe('Install My Luma');
    });
});

describe('Uninstall’s lines', () => {
    it('reads the new version first, on Remove, which only starts once it is known to install', () => {
        const steps = importSteps(
            source({ replaces: 'Bodea, main', phase: 'Reading the datapack' })
        );

        expect(remove(steps)).toMatchObject({
            status: 'checking',
            line: 'Reading the new version',
        });
        expect(install(steps).line).toBe('Waiting');
    });

    it('names what it removes and the count while it runs, and Install waits for it', () => {
        const steps = importSteps(
            source({ ...SAME_PACK, replacing: 'processing', detail: '120 of 400 products' })
        );

        expect(remove(steps)).toMatchObject({
            status: 'checking',
            line: 'Uninstalling 120 of 400 products',
        });
        expect(install(steps).line).toBe('Waiting');
    });

    it('names the pack it removes when it is another pack, with no count before one comes', () => {
        const steps = importSteps(source({ replaces: 'Bodea, main', replacing: 'processing' }));

        expect(remove(steps).line).toBe('Uninstalling Bodea, main');
    });

    it('says Uninstalled once it is done, and Install starts', () => {
        const steps = importSteps(
            source({
                ...SAME_PACK,
                replacing: 'success',
                phase: 'Comparing Commerce with the datapack',
            })
        );

        expect(remove(steps)).toMatchObject({ status: 'success', line: 'Uninstalled Nov 1, 12:00 PM' });
        expect(install(steps)).toMatchObject({ status: 'checking', line: 'Reading from Commerce' });
    });

    it('fails with the reason when the job stopped while removing, and installs nothing', () => {
        const steps = importSteps(
            source({
                ...SAME_PACK,
                running: false,
                stoppedAt: REPLACE_STOP,
                reason: 'Commerce did not respond.',
            })
        );

        expect(remove(steps)).toMatchObject({
            status: 'error',
            problem: { text: 'Commerce did not respond.', failed: true },
        });
        expect(install(steps).line).toBe('Not run');
        expect(verify(steps).line).toBe('Not run');
    });
});

describe('Install’s lines', () => {
    it('reads and compares on Install when nothing is replaced', () => {
        expect(install(importSteps(source({ phase: 'Reading the datapack' }))).line).toBe(
            'Reading the new version'
        );
        expect(
            install(importSteps(source({ phase: 'Comparing Commerce with the datapack' }))).line
        ).toBe('Reading from Commerce');
    });

    it('counts the types in once one has begun; only the type in progress has a count', () => {
        const steps = importSteps(
            source({
                perType: { categories: 'success', products: 'processing' },
                detail: '450 of 2,046 products',
            })
        );

        expect(install(steps)).toMatchObject({ status: 'checking', line: '1 of 2 data types' });
        expect(install(steps).types).toStrictEqual([
            { kind: 'categories', label: 'Categories', status: 'success', line: 'Done' },
            {
                kind: 'products',
                label: 'Products',
                status: 'checking',
                line: 'Installing 450 of 2,046',
            },
        ]);
    });

    // Owner, 2026-11-10, walk F133: the slow configurable part is the working row's own words;
    // Install's line stays a plain count of data types.
    it('names the configurable part on the Products row, word first, and Install stays a count', () => {
        const steps = importSteps(
            source({
                perType: { categories: 'success', products: 'processing' },
                detail: `2,044 of 2,046 products${LINKING_OPTIONS}`,
            })
        );

        expect(install(steps).line).toBe('1 of 2 data types');
        expect(install(steps).types?.[1]?.line).toBe('Linking product options 2,044 of 2,046');
    });

    it('says Installed once every type is in, a type with a note included', () => {
        const steps = importSteps(
            source({
                running: false,
                perType: { categories: 'success', products: 'success' },
                rowNotes: { products: 'Commerce refused 3 rows.' },
            })
        );

        expect(install(steps)).toMatchObject({ status: 'success', line: 'Installed' });
    });
});

// Owner, 2026-11-10, walk F133: the working data type's second line, the word first, then the count.
describe('the working data type’s second line', () => {
    it('puts the word before the count, without the noun its name already gives', () => {
        expect(doingLine('1,200 of 2,046 products')).toBe('Installing 1,200 of 2,046');
        expect(doingLine(`2,044 of 2,046 products${LINKING_OPTIONS}`)).toBe(
            'Linking product options 2,044 of 2,046'
        );
    });

    it('is the word alone before the engine gives a count', () => {
        expect(doingLine(undefined)).toBe('Installing');
    });

    it('goes on the working row only: done and waiting rows have no second line', () => {
        const steps = importSteps(
            source({
                dataTypes: ['categories', 'products', 'customers'],
                perType: { categories: 'success', products: 'processing', customers: 'pending' },
                detail: '1,200 of 2,046 products',
            })
        );
        const lines = install(steps).types?.map((t) => [t.kind, t.status, t.line]);

        expect(lines).toStrictEqual([
            ['categories', 'success', 'Done'],
            ['products', 'checking', 'Installing 1,200 of 2,046'],
            ['customers', 'pending', 'Waiting'],
        ]);
    });
});

describe('Verify’s lines', () => {
    const allIn = { categories: 'success', products: 'success' } as const;

    it('waits while the types go in, then records and checks once they are in', () => {
        expect(verify(importSteps(source({ perType: { categories: 'processing' } }))).line).toBe(
            'Waiting'
        );
        expect(
            verify(importSteps(source({ perType: allIn, phase: 'Recording what was installed' })))
        ).toMatchObject({
            status: 'checking',
            line: 'Recording installed items',
        });
        expect(
            verify(
                importSteps(
                    source({ perType: allIn, phase: 'Checking products' })
                )
            )
        ).toMatchObject({ status: 'checking', line: 'Checking products' });
    });

    it('ends on what the check found when it matched', () => {
        const steps = importSteps(
            source({ running: false, perType: allIn, check: CHECK })
        );

        expect(verify(steps)).toStrictEqual({
            kind: 'finishing',
            label: 'Verify Installation',
            status: 'success',
            line: '2,046 products match the datapack',
        });
    });

    it('ends on Done with no check on the record', () => {
        expect(verify(importSteps(source({ running: false, perType: allIn }))).line).toBe('Done');
    });

    it('ends orange with how many products differ, said once, on Verify', () => {
        const check = { ...CHECK, verdict: 'differs' as const, checked: 2048, productsDiffer: 3 };
        const steps = importSteps(source({ running: false, perType: allIn, check }));

        expect(verify(steps)).toMatchObject({
            status: 'warning',
            problem: { text: '3 of 2,048 products differ from the datapack', failed: false },
        });
        // Not on the products' row as well (review, 2026-11-10).
        const products = steps.flatMap((s) => s.types ?? []).find((t) => t.kind === 'products');
        expect(products?.problem).toBeUndefined();
    });

    it('says "some differ" for a check recorded before it counted the products', () => {
        const steps = importSteps(
            source({ running: false, perType: allIn, check: { ...CHECK, verdict: 'differs', checked: 12 } })
        );

        expect(verify(steps).problem?.text).toBe('some of 12 products differ from the datapack');
    });

    it('fails with the reason when the job stopped after every type was in', () => {
        const steps = importSteps(
            source({
                running: false,
                perType: allIn,
                stoppedAt: FINISHING_STOP,
                reason: 'The record could not be written.',
            })
        );

        expect(verify(steps)).toMatchObject({
            status: 'error',
            problem: { text: 'The record could not be written.', failed: true },
        });
    });
});

describe('a stop', () => {
    it('on a type: Install says where, the type keeps the reason, what came after did not run', () => {
        const steps = importSteps(
            source({
                running: false,
                dataTypes: ['categories', 'products', 'source_items'],
                perType: { categories: 'success', products: 'error', source_items: 'error' },
                stoppedAt: 'products',
                reason: 'Commerce did not respond.',
            })
        );

        // The reason is the data type's line alone: Install says Stopped, not where again.
        expect(install(steps)).toMatchObject({ status: 'error', line: 'Stopped' });
        expect(install(steps).problem).toBeUndefined();
        const types = install(steps).types ?? [];
        expect(types.find((t) => t.kind === 'products')).toMatchObject({
            status: 'error',
            problem: { text: 'Commerce did not respond.', failed: true },
        });
        expect(types.find((t) => t.kind === 'source_items')).toMatchObject({
            status: 'pending',
            line: 'Not run',
        });
        expect(verify(steps).line).toBe('Not run');
    });

    it('before any type, with nothing replaced: the reason sits on Install', () => {
        const steps = importSteps(
            source({ running: false, reason: 'Choose the website and store view first.' })
        );

        expect(install(steps)).toMatchObject({
            status: 'error',
            problem: { text: 'Choose the website and store view first.', failed: true },
        });
        expect(verify(steps).line).toBe('Not run');
    });

    it('before any type, replacing a pack: the reason sits on Remove, and Install did not run', () => {
        const steps = importSteps(
            source({
                replaces: 'Bodea, main',
                running: false,
                reason: 'The new version could not be read.',
            })
        );

        expect(remove(steps)).toMatchObject({
            status: 'error',
            problem: { text: 'The new version could not be read.', failed: true },
        });
        expect(install(steps)).toMatchObject({ status: 'pending', line: 'Not run' });
        expect(install(steps).problem).toBeUndefined();
    });
});
