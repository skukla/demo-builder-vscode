/**
 * The ONE adapter from AuthenticationService to {@link EventLifecycleDeps} —
 * shared by the MCP event tools and the dashboard's Eventing handlers, so the
 * credential/subscribe/client wiring cannot drift between surfaces. Built on
 * `createTeardownDeps` (the shapes are proven there); only the client factory
 * differs, because the lifecycle needs the CREATE half.
 */

import type { AuthenticationService } from '../services/authenticationService';
import type { EventLifecycleDeps } from '../services/eventProviderLifecycle';
import { IoEventsClient } from '../services/ioEventsClient';
import { createTeardownDeps } from './deleteAdobeProjectHandler';

export function createEventLifecycleDeps(authService: AuthenticationService): EventLifecycleDeps {
    const teardown = createTeardownDeps(authService);
    return {
        getAccessToken: teardown.getAccessToken,
        getWorkspaceS2SCredential: teardown.getWorkspaceS2SCredential,
        createWorkspaceS2SCredentialFor: teardown.createWorkspaceS2SCredentialFor,
        subscribeManagementApi: teardown.subscribeManagementApi,
        createEventsClient: (auth) => new IoEventsClient(auth),
    };
}
