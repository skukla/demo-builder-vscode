/**
 * commerceSections — a chosen datapack needs a website and store view (step-07 W1, S7-a).
 *
 * The build's install skips a datapack when the project names no website and store view for its
 * backend (`resolveInstallTarget`), so a creation install could be skipped without a word. The
 * wizard now holds Continue until both codes are set for the chosen backend, whenever a datapack is
 * chosen. With no datapack chosen nothing changes. In Edit, where the codes live in Configure, the
 * Datapacks step is locked with the Configure line instead (owner, Q7).
 */

import {
    commerceSectionStates,
    isCommerceStepComplete,
} from '@/features/project-creation/ui/steps/commerceSections';
import type { WizardState } from '@/types/webview';
import { ACCS, PAAS, state } from './commerceSections.testUtils';

const CTX = { isAccs: false, signedIn: false };
const PACK = { name: 'bodea', version: 'main' };

/** PaaS, connected, a store view chosen: everything before Datapacks done. */
function ready(over: Partial<WizardState> = {}): WizardState {
    return state({
        selectedBackend: PAAS,
        commerceConnectValid: true,
        commerceStoreViewChosen: true,
        ...over,
    });
}

const BOTH_PAAS = {
    [PAAS]: { ADOBE_COMMERCE_WEBSITE_CODE: 'base', ADOBE_COMMERCE_STORE_VIEW_CODE: 'default' },
};
const VIEW_ONLY_PAAS = { [PAAS]: { ADOBE_COMMERCE_STORE_VIEW_CODE: 'default' } };

function datapackStep(s: WizardState) {
    return commerceSectionStates(s, CTX).find((sec) => sec.id === 'sample-data');
}

describe('Business Structure, with a datapack chosen', () => {
    it('is not complete with a store view but no website for the chosen backend', () => {
        const s = ready({ datapack: PACK, componentConfigs: VIEW_ONLY_PAAS });
        expect(isCommerceStepComplete(s, 'business-structure', CTX)).toBe(false);
    });

    it('is not complete when the codes belong to another backend', () => {
        const s = ready({
            datapack: PACK,
            componentConfigs: {
                [ACCS]: { ACCS_WEBSITE_CODE: 'base', ACCS_STORE_VIEW_CODE: 'default' },
            },
        });
        expect(isCommerceStepComplete(s, 'business-structure', CTX)).toBe(false);
    });

    it('is complete with both codes for the chosen backend', () => {
        const s = ready({ datapack: PACK, componentConfigs: BOTH_PAAS });
        expect(isCommerceStepComplete(s, 'business-structure', CTX)).toBe(true);
    });

    it('changes nothing with no datapack chosen: a store view alone still completes it', () => {
        const s = ready({ componentConfigs: VIEW_ONLY_PAAS });
        expect(isCommerceStepComplete(s, 'business-structure', CTX)).toBe(true);
    });
});

describe('the Datapacks step', () => {
    it('is locked, and holds Continue, with a datapack chosen and no target', () => {
        const s = ready({ datapack: PACK, componentConfigs: VIEW_ONLY_PAAS });
        expect(datapackStep(s)).toMatchObject({
            status: 'locked',
            lockReason: 'Choose a website and store view first',
        });
        expect(isCommerceStepComplete(s, 'sample-data', CTX)).toBe(false);
    });

    it('is done and lets Continue through with a datapack chosen and both codes', () => {
        const s = ready({ datapack: PACK, componentConfigs: BOTH_PAAS });
        expect(datapackStep(s)).toMatchObject({ status: 'done', value: 'bodea' });
        expect(isCommerceStepComplete(s, 'sample-data', CTX)).toBe(true);
    });

    it('changes nothing with no datapack chosen, even with no codes at all', () => {
        const s = ready();
        expect(datapackStep(s)).toMatchObject({ status: 'done', value: 'None' });
        expect(isCommerceStepComplete(s, 'sample-data', CTX)).toBe(true);
    });

    it('in Edit, with the codes missing, points to Configure', () => {
        const s = ready({ wizardMode: 'edit', datapack: PACK, componentConfigs: VIEW_ONLY_PAAS });
        expect(datapackStep(s)).toMatchObject({
            status: 'locked',
            lockReason: 'Set the website and store view in Configure first.',
        });
        expect(isCommerceStepComplete(s, 'sample-data', CTX)).toBe(false);
    });

    it('in Edit after the backend changed, asks for them here, since the strip shows them again', () => {
        const s = ready({
            wizardMode: 'edit',
            foundationChanged: true,
            datapack: PACK,
            componentConfigs: VIEW_ONLY_PAAS,
        });
        expect(datapackStep(s)?.lockReason).toBe('Choose a website and store view first');
    });
});
