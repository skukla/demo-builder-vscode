/**
 * A fake of the ERP integration a wipe calls ("One action, ERP included"): its three calls as jest
 * mocks answering the typed fixtures (`tests/helpers/erpWipeFixtures.ts`), behind the real
 * `wipeErpOf`, so a suite asserts what the integration was asked, with its arguments.
 */

import { type WipeErpLink, wipeErpOf } from '@/features/data-installer/services/demoDataWipe/wipeErp';
import type { ResolvedErpSettings } from '@/features/app-builder/services/erpFill';
import type { ErpIntegrationStatus, ErpStoreCloseReport } from '@/types/erpIntegration';
import { JUSTRITE_SETTINGS, STATUS_BY_STORE, STORE_CLOSE } from '../../../../helpers/erpWipeFixtures';

export interface FakeErpOptions {
    status?: ErpIntegrationStatus;
    settings?: ResolvedErpSettings;
    close?: () => Promise<ErpStoreCloseReport>;
    refill?: WipeErpLink['refill'];
    /** No signed-in client: why. */
    refusal?: string;
}

export function fakeErp(options: FakeErpOptions = {}) {
    const client = {
        status: jest.fn(async () => options.status ?? STATUS_BY_STORE),
        resolvedSettings: jest.fn(async (_codes: string[]) => options.settings ?? JUSTRITE_SETTINGS),
        closeOrders: jest.fn(options.close ?? (async () => STORE_CLOSE)),
    };
    const refill = jest.fn(options.refill ?? (async () => ({})));
    const refusal = options.refusal;
    const link: WipeErpLink = {
        project: { displayName: 'JustRite', name: 'justrite' },
        integrationId: 'erp-integration',
        erpNames: { justrite: 'Justrite ERP', accuform: 'Accuform ERP' },
        client: async () => (refusal ? { refusal } : client),
        refill,
    };
    return { erp: wipeErpOf(link), client, refill };
}
