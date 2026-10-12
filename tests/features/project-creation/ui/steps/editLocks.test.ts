/**
 * editLocks — what Edit leaves to Configure.
 *
 * Edit changes what a project is built from; Configure changes its settings.
 * The project name, the Commerce settings and the block libraries used to be
 * changeable in both, with different results. In Edit they are now shown and
 * not changeable, and the Commerce settings and block libraries come back when
 * the package or backend changes (that change resets them).
 *
 * The Commerce gates are asserted through the real `commerceSections` and
 * `tileStatus`, because a lock that only the notice honoured would still leave
 * Continue waiting on a form that is never shown.
 */

import {
    commerceSectionStates,
    isCommerceStepComplete,
} from '@/features/project-creation/ui/steps/commerceSections';
import {
    isNameSetInConfigure,
    isSetInConfigure,
    projectNameDescription,
    RENAME_IN_CONFIGURE,
} from '@/features/project-creation/ui/steps/editLocks';
import { isCommerceConfigured } from '@/features/project-creation/ui/steps/tileStatus';
import type { WizardState } from '@/types/webview';
import { PAAS, state } from './commerceSections.testUtils';

const PAAS_CTX = { isAccs: false, signedIn: false };
const CONFIG_STEPS = ['connection', 'business-structure', 'catalog'] as const;

/** An Edit session on a PaaS project whose Commerce form has reported nothing yet. */
function editing(overrides: Partial<WizardState> = {}): WizardState {
    return state({
        wizardMode: 'edit',
        selectedBackend: PAAS,
        selectedStack: 'eds-paas',
        ...overrides,
    });
}

describe('which mode leaves what to Configure', () => {
    it.each([
        ['create', false],
        ['import', false],
        ['edit', true],
    ] as const)('%s: name locked = %s', (wizardMode, locked) => {
        expect(isNameSetInConfigure({ wizardMode })).toBe(locked);
    });

    it('locks the Commerce settings and block libraries in Edit', () => {
        expect(isSetInConfigure({ wizardMode: 'edit' })).toBe(true);
    });

    it('unlocks them once the package or backend changed', () => {
        expect(isSetInConfigure({ wizardMode: 'edit', foundationChanged: true })).toBe(false);
    });

    it('never locks outside Edit', () => {
        expect(isSetInConfigure({ wizardMode: 'create' })).toBe(false);
        expect(isSetInConfigure({ wizardMode: 'import' })).toBe(false);
    });
});

describe('the line under the project name', () => {
    it('points to Configure in Edit', () => {
        expect(projectNameDescription({ wizardMode: 'edit', projectName: 'bodea' })).toBe(
            RENAME_IN_CONFIGURE,
        );
    });

    it('names the folder otherwise', () => {
        expect(projectNameDescription({ wizardMode: 'create', projectName: 'bodea' })).toBe(
            'Folder: bodea',
        );
    });

    it('says nothing before a name is typed', () => {
        expect(projectNameDescription({ wizardMode: 'create', projectName: '' })).toBeUndefined();
    });
});

describe('the Commerce strip in Edit', () => {
    it('shows the three settings steps as done, with no form verdict', () => {
        const sections = commerceSectionStates(editing(), PAAS_CTX);

        expect(sections.map((s) => [s.id, s.status])).toEqual([
            ['backend', 'done'],
            ['connection', 'done'],
            ['business-structure', 'done'],
            ['catalog', 'done'],
            ['sample-data', 'done'],
        ]);
    });

    it.each(CONFIG_STEPS)('lets Continue past %s without the form', (step) => {
        expect(isCommerceStepComplete(editing(), step, PAAS_CTX)).toBe(true);
    });

    it('counts the Commerce area as configured', () => {
        expect(isCommerceConfigured(editing())).toBe(true);
    });

    it('still needs a stack', () => {
        expect(isCommerceConfigured(editing({ selectedStack: undefined }))).toBe(false);
    });

    it('still waits for the ACCS sign-in, which is not a setting', () => {
        const ctx = { isAccs: true, signedIn: false };

        expect(isCommerceStepComplete(editing(), 'signin', ctx)).toBe(false);
    });
});

describe('the Commerce strip once the backend or package changed', () => {
    const changed = editing({ foundationChanged: true });

    it('asks for the connection again', () => {
        const connection = commerceSectionStates(changed, PAAS_CTX).find(
            (s) => s.id === 'connection',
        );

        expect(connection?.status).toBe('upcoming');
    });

    it('holds Continue until the form reports valid', () => {
        expect(isCommerceStepComplete(changed, 'connection', PAAS_CTX)).toBe(false);
        expect(isCommerceConfigured(changed)).toBe(false);
    });
});
