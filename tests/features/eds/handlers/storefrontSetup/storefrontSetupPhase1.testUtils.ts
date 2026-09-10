/**
 * The two things both storefrontSetupPhase1 suites build identically.
 *
 * Their mock walls differ — the appGate suite stubs the App Builder resolver and
 * records call order, the pin suite stubs the LKG pin helper — and each has its
 * own `beforeEach` because each is proving something different about ordering.
 * So only the context factory and the template coordinates live here: fourteen
 * lines that were byte-identical, and a constant that was written twice.
 */

import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import {
    createStatefulGlobalState,
    createMockExtensionContext,
} from '../../../../helpers/extensionContextFake';
import { createMockSecretStorage } from '../../../../helpers/secretStorageFake';
import type { HandlerContext } from '@/types/handlers';

/** A handler context with real stateful storage behind secrets and globalState. */
export function makeContext(): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger(),
        sendMessage: jest.fn().mockResolvedValue(undefined),
        context: createMockExtensionContext({
            secrets: createMockSecretStorage().secrets,
            globalState: createStatefulGlobalState().globalState,
        }),
    });
}

/** The B2B template phase 1 creates from. */
export const TEMPLATE = { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' };
