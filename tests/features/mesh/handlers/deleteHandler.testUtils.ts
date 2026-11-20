/**
 * Shared setup for the deleteHandler family (2 suites): the services the handler fetches.
 *
 * Both suites hand the handler a command executor and an auth service through the
 * ServiceLocator. The `jest.mock('@/core/di/serviceLocator')` itself stays in each
 * suite: a `jest.mock` only hoists above the imports of the file it appears in.
 */

import { ServiceLocator } from '@/core/di/serviceLocator';
import { poolUnits } from '../../../helpers/authenticationServiceFake';

/**
 * Register the executor the delete runs through, and an Adobe sign-in that answers
 * `signedIn`, with no cached organization.
 *
 * @param executor - what `ServiceLocator.getCommandExecutor` hands back
 * @param signedIn - what `isAuthenticated` answers
 */
export function servicesFor(executor: { execute: jest.Mock }, signedIn = true): void {
    (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(executor);
    (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(
        poolUnits({
            isAuthenticated: jest.fn().mockResolvedValue(signedIn),
            getCachedOrganization: jest.fn().mockReturnValue(undefined),
        }),
    );
}
