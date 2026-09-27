/**
 * SetupStatus — "Setup: N to do" while an integration's demo setup has steps open (AB-26x).
 * The words are pinned here; that the card and the grid show them is pinned in
 * IntegrationsGrid-setupGuide.test.tsx.
 */

import { setupStatusText } from '@/core/ui/components/integrations/SetupStatus';
import type { IntegrationCardModel } from '@/core/ui/components/integrations/integrationCardModel.types';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

const step = (id: string, state: SetupChecklistItem['state']): SetupChecklistItem => ({
    id,
    title: id,
    why: 'why',
    where: 'where',
    state,
    checkable: false,
});

const model = (items?: SetupChecklistItem[]) => ({ id: 'erp-integration', setupChecklist: items }) as IntegrationCardModel;

describe('setupStatusText', () => {
    it('counts only the steps still to do', () => {
        expect(setupStatusText(model([step('a', 'open'), step('b', 'done'), step('c', 'open')]))).toBe('Setup: 2 to do');
    });

    it('says nothing once every step is done or skipped', () => {
        expect(setupStatusText(model([step('a', 'done'), step('b', 'dismissed')]))).toBeUndefined();
    });

    it('says nothing for an integration without steps', () => {
        expect(setupStatusText(model())).toBeUndefined();
    });
});
