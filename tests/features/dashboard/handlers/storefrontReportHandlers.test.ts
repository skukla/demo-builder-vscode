/**
 * The storefront report's window on the dashboard (EDS-64): `getStorefrontReport`
 * answers what it shows, and `takeStorefrontReportRequest` tells a dashboard just opened
 * from the Command Palette to open it, once.
 */

jest.mock('@/features/eds/services/storefront/storefrontReportDeps', () => ({
    createStorefrontReportDeps: jest.fn(() => ({ marker: 'deps' })),
}));
jest.mock('@/features/eds/services/storefront/storefrontReport', () => ({
    readStorefrontReport: jest.fn(),
    storefrontReportView: jest.fn(() => ({ brokenLinks: [], about: [], details: ['view'] })),
}));

import {
    handleGetStorefrontReport,
    handleTakeStorefrontReportRequest,
    requestStorefrontReport,
} from '@/features/dashboard/handlers/storefrontReportHandlers';
import { readStorefrontReport, storefrontReportView } from '@/features/eds/services/storefront/storefrontReport';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const mockRead = readStorefrontReport as jest.Mock;
const REPORT = { repository: { owner: 'skukla', repo: 'kukla-justrite' } };

function context(project = createMockProject({ name: 'justrite', title: 'JustRite' })) {
    return createMockHandlerContext({
        stateManager: createMockStateManager({ getCurrentProject: jest.fn().mockResolvedValue(project) }),
    });
}

beforeEach(() => jest.clearAllMocks());

describe('getStorefrontReport', () => {
    it("answers the report for the dashboard's project, as the window shows it", async () => {
        mockRead.mockResolvedValue(REPORT);

        const result = await handleGetStorefrontReport(context());

        expect(storefrontReportView).toHaveBeenCalledWith(REPORT);
        expect(result).toStrictEqual({ success: true, data: { brokenLinks: [], about: [], details: ['view'] } });
    });

    it('says, by the name the SC gave it, when the project has no storefront to report on', async () => {
        mockRead.mockResolvedValue(undefined);

        await expect(handleGetStorefrontReport(context())).resolves.toStrictEqual({
            success: false,
            error: 'JustRite has no Edge Delivery storefront to report on.',
        });
    });

    it('answers a failed read as a reason, never by throwing', async () => {
        mockRead.mockRejectedValue(new Error('GitHub 502'));

        await expect(handleGetStorefrontReport(context())).resolves.toStrictEqual({
            success: false,
            error: 'Could not read the storefront report: GitHub 502',
        });
    });
});

describe('takeStorefrontReportRequest', () => {
    it('opens the window once for a dashboard opened to show it, and not again', async () => {
        requestStorefrontReport();

        await expect(handleTakeStorefrontReportRequest(context())).resolves.toStrictEqual({
            success: true,
            data: { show: true },
        });
        await expect(handleTakeStorefrontReportRequest(context())).resolves.toStrictEqual({
            success: true,
            data: { show: false },
        });
    });
});
