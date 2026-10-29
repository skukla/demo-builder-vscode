/**
 * Shared setup for the meshEndpoint suites.
 *
 * THIS FILE OWNS THE SLEEP MOCK AND THE MODULE IMPORT. `answeringEndpoint` waits
 * between its rounds, and no suite should spend that wait for real. jest.mock
 * hoists above the imports of the module it appears in, not across modules, so
 * the specs take the module from HERE.
 */

import { sleep } from '@/core/utils/sleep';
import {
    answeringEndpoint,
    getEndpoint,
    meshAnswersAt,
} from '@/features/mesh/services/meshEndpoint';

jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

export { answeringEndpoint, getEndpoint, meshAnswersAt };

/** The mocked wait between probe rounds. */
export const mockSleep = sleep as jest.Mock;
