/**
 * Shared setup for the `storefrontSetupPhase3` suites: the App verdict
 * (`-confirmCodeSync`) and the code publish (`-codePublish`), split at the 750-line
 * limit on 2026-10-22.
 *
 * Only the collaborators the phase is HANDED live here. The module mocks
 * (registration, permissions, the resolver, sleep) stay in each spec: a `jest.mock`
 * hoists only above the imports of the file it is written in.
 */

import type { SetupServices } from '@/features/eds/handlers/storefrontSetup/storefrontSetupTypes';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../../helpers/loggerFake';

/** A handler context whose progress pushes are recorded. */
export function makePhase3Context(): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger(),
        sendMessage: jest.fn().mockResolvedValue(undefined),
    });
}

/**
 * The services phase 3 reaches: a code publish that succeeds, a signed-in DA.live
 * user, and an App that reports installed.
 *
 * @param onPublish - called on every code publish, for suites that pin ORDER
 */
export function makePhase3Services(onPublish: () => void = () => undefined): SetupServices {
    return {
        helixService: {
            previewCode: jest.fn().mockImplementation(async () => {
                onPublish();
            }),
        },
        daLiveAuthService: { getUserEmail: jest.fn().mockResolvedValue('k@adobe.com') },
        daLiveTokenProvider: {},
        githubAppService: {
            isAppInstalled: jest.fn().mockResolvedValue({ isInstalled: true, codeStatus: 200 }),
            getInstallUrl: jest.fn().mockReturnValue('https://github.com/apps/aem-code-sync'),
        },
    } as unknown as SetupServices;
}

/** Every progress line the phase pushed, one per line. */
export function progressMessages(context: HandlerContext): string {
    return (context.sendMessage as unknown as jest.Mock).mock.calls
        .filter((c) => c[0] === 'storefront-setup-progress')
        .map((c) => String((c[1] as { message?: string }).message))
        .join('\n');
}

/** The type of every message the phase sent, in order. */
export function sentTypes(context: HandlerContext): string[] {
    return (context.sendMessage as unknown as jest.Mock).mock.calls.map((c) => c[0] as string);
}
