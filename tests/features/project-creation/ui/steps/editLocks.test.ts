/**
 * editLocks — what Edit leaves to Configure.
 *
 * Edit changes what a project is built from; Configure changes its settings.
 * The Commerce settings and the block libraries used to be changeable in both,
 * with different results. In Edit they are not changeable, and come back when
 * the package or backend changes (that change resets them). The project name
 * was locked the same way until Edit could rename with Configure's own rename.
 *
 * The Commerce gates are asserted through the real `commerceSections` and
 * `tileStatus`, because a lock that only the notice honoured would still leave
 * Continue waiting on a form that is never shown.
 */

import {
    commerceSectionStates,
    isCommerceStepComplete,
} from '@/features/project-creation/ui/steps/commerceSections';
import { isSetInConfigure, projectNameDescription } from '@/features/project-creation/ui/steps/editLocks';
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
    // Edit used to say "Rename in Configure." and lock the field; it now renames with
    // the same rename Configure uses (owner, 2026-10-17), so it names the folder too.
    it('names the folder, in Edit as when creating', () => {
        expect(projectNameDescription({ projectName: 'bodea' })).toBe('Folder: bodea');
    });

    it('says nothing before a name is typed', () => {
        expect(projectNameDescription({ projectName: '' })).toBeUndefined();
    });
});

describe('the Commerce strip in Edit', () => {
    // They used to be three steps that each said only "Changed in Configure", walked
    // through with three Continues (owner, 2026-10-17). The summary still shows them.
    it('leaves the three settings steps out of the strip', () => {
        const sections = commerceSectionStates(editing(), PAAS_CTX);

        expect(sections.map((s) => [s.id, s.status])).toEqual([
            ['backend', 'done'],
            ['sample-data', 'done'],
        ]);
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

    it('puts the three settings steps back in the strip', () => {
        const ids = commerceSectionStates(changed, PAAS_CTX).map((s) => s.id);

        expect(ids).toEqual(expect.arrayContaining([...CONFIG_STEPS]));
    });

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
