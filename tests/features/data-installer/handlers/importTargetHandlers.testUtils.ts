/**
 * The harness the two `importTargetHandlers` suites share.
 *
 * Both handlers are READS: no write client, no job runner, so there is no
 * module wall here — only a handler context around one project (or none).
 * `overrides` is for the scopes suite, whose credential resolution reaches
 * for an auth service.
 */

import * as vscode from 'vscode';
import type { HandlerContext } from '@/types/handlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import {
    createStatefulGlobalState,
    createMockExtensionContext,
} from '../../../helpers/extensionContextFake';

/** A handler context whose current project is `project` (`null` for none). */
export function makeTargetHarness(
    project: unknown,
    overrides: Partial<HandlerContext> = {},
): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        panel: {} as vscode.WebviewPanel,
        context: createMockExtensionContext({
            globalState: createStatefulGlobalState().globalState,
            secrets: createMockSecretStorage().secrets,
        }),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
        }),
        sendMessage: jest.fn(),
        ...overrides,
    });
}
