/**
 * integrationSettings — where Settings goes on a card's actions (AB-21).
 */

import type { IntegrationCardModel } from '@/core/ui/components/integrations/integrationCardModel.types';
import { withComponentSettings } from '@/features/dashboard/ui/components/integrations/integrationSettings';
import type { ComponentSettings } from '@/types/appBuilderComponents';

const SETTINGS: ComponentSettings = {
    fields: [
        { name: 'ERP_DISPLAY_NAME', label: 'ERP name', type: 'text', required: false, value: 'Acme ERP' },
        { name: 'ERP_REGION', label: 'Region', type: 'text', required: true, value: '' },
        { name: 'ERP_API_KEY', label: 'API key', type: 'secret', required: true, isSet: true },
    ],
    connected: [],
};

function cardWith(menuActions: IntegrationCardModel['menuActions'], componentId = 'erp-integration') {
    return { id: `card-${componentId}`, componentId, menuActions } as unknown as IntegrationCardModel;
}

describe('withComponentSettings', () => {
    it('puts Settings just before Manage APIs', () => {
        const [card] = withComponentSettings(
            [cardWith(['open', 'redeploy', 'manage-apis', 'remove'])],
            { 'erp-integration': SETTINGS },
        );

        expect(card.menuActions).toEqual(['open', 'redeploy', 'settings', 'manage-apis', 'remove']);
    });

    it('with no Manage APIs, before Remove; with neither, last', () => {
        const settings = { 'erp-integration': SETTINGS };

        expect(withComponentSettings([cardWith(['redeploy', 'remove'])], settings)[0].menuActions)
            .toEqual(['redeploy', 'settings', 'remove']);
        expect(withComponentSettings([cardWith(['redeploy'])], settings)[0].menuActions)
            .toEqual(['redeploy', 'settings']);
    });

    it('an empty menu stays empty: mid-deploy, every item would race the runner', () => {
        const [card] = withComponentSettings([cardWith([])], { 'erp-integration': SETTINGS });

        expect(card.menuActions).toStrictEqual([]);
    });

    it('leaves a card without settings exactly as it was', () => {
        const original = cardWith(['redeploy', 'remove'], 'demo-erp');

        expect(withComponentSettings([original], { 'erp-integration': SETTINGS })[0]).toBe(original);
    });
});
