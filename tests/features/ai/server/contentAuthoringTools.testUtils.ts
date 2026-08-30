/**
 * Shared setup for the contentAuthoringTools suites.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY REPLACE. Specs import those
 * from HERE and declare no jest.mock of their own — jest.mock hoists above the
 * imports of the module it appears in, NOT across modules, so an import left
 * behind in a spec loads the real module before these mocks register.
 *
 * Extracted 2026-08-30 (lane C1) from byte-identical copies in:
 *   contentAuthoringTools-sizes.test.ts
 *   contentAuthoringTools.test.ts
 */

import { registerContentAuthoringTools } from '@/features/ai/server/contentAuthoringTools';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { DaLiveContentOperations } from '@/features/eds/services/daLive/daLiveContentOperations';
import { HelixService } from '@/features/eds/services/helix/helixService';
import { isEdsProject } from '@/types/typeGuards';

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(),
    getDaLiveAuthService: jest.fn(),
}));
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn(),
    createDaLiveServiceTokenProvider: jest.fn(() => ({ getAccessToken: async () => 'da-token' })),
}));
jest.mock('@/features/eds/services/helix/helixService', () => ({
    HelixService: jest.fn(),
}));
jest.mock('@/types/typeGuards', () => ({
    ...jest.requireActual('@/types/typeGuards'),
    isEdsProject: jest.fn(),
}));
jest.mock('@/features/ai/server/adobeTargetStore', () => ({
    getAdobeTarget: jest.fn(() => ({ orgId: 'org-stored' })),
    runWithAdobeTarget: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));
const getGitHubServicesMock = getGitHubServices as jest.Mock;
const getDaLiveAuthServiceMock = getDaLiveAuthService as jest.Mock;
const isEdsProjectMock = isEdsProject as unknown as jest.Mock;
const DaLiveContentOperationsMock = DaLiveContentOperations as unknown as jest.Mock;
const HelixServiceMock = HelixService as unknown as jest.Mock;
const getCurrentProject = jest.fn();

export { registerContentAuthoringTools };
export { getDaLiveAuthService, getGitHubServices };
export { DaLiveContentOperations };
export { HelixService };
export { isEdsProject };

export {
    DaLiveContentOperationsMock,
    HelixServiceMock,
    getCurrentProject,
    getDaLiveAuthServiceMock,
    getGitHubServicesMock,
    isEdsProjectMock,
};
