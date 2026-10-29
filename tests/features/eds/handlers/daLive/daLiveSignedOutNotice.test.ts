/**
 * Where the SC is told that a forced Adobe sign-in also signed them out of DA.live:
 * the agent's result when its `sign_in` collects, otherwise a notification with the
 * existing DA.live sign-in (plus the chat narration under an agent call).
 */
const mockShowWarningMessage = jest.fn();
const mockExecuteCommand = jest.fn();
jest.mock(
    'vscode',
    () => ({
        window: { showWarningMessage: (...a: unknown[]) => mockShowWarningMessage(...a) },
        commands: { executeCommand: (...a: unknown[]) => mockExecuteCommand(...a) },
    }),
    { virtual: true },
);

const mockCheckSignIn = jest.fn();
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getDaLiveAuthService: () => ({ checkSignIn: mockCheckSignIn }),
}));

import { collectSignInNotices } from '@/core/auth/signInNotices';
import { runWithCallTag } from '@/core/logging/callTagContext';
import { withPhaseSinks } from '@/core/utils/agentPhaseChannel';
import {
    registerDaLiveForcedSignInWatch,
    SIGN_IN_TO_DA_LIVE,
    tellDaLiveSignedOut,
} from '@/features/eds/handlers/daLive/daLiveSignedOutNotice';
import type { ForcedSignInWatch } from '@/features/authentication/services/adobeSignIn';
import { createMockExtensionContext } from '../../../../helpers/extensionContextFake';

const MESSAGE = 'Signing in to Adobe again also signed you out of DA.live.';
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('tellDaLiveSignedOut', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockShowWarningMessage.mockResolvedValue(undefined);
    });

    it('at a button: a notification whose button opens the existing DA.live sign-in', async () => {
        mockShowWarningMessage.mockResolvedValue(SIGN_IN_TO_DA_LIVE);

        tellDaLiveSignedOut(MESSAGE);
        await flush();

        expect(mockShowWarningMessage).toHaveBeenCalledWith(MESSAGE, 'Sign in to DA.live');
        expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.signInDaLive');
    });

    it('opens nothing when the SC dismisses it', async () => {
        tellDaLiveSignedOut(MESSAGE);
        await flush();
        expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it("under the agent's sign_in: into its result, and no window at all", async () => {
        const { notices } = await collectSignInNotices(async () => tellDaLiveSignedOut(MESSAGE));

        expect(notices).toStrictEqual([MESSAGE]);
        expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });

    it('under any other agent call: said in the chat narration, and the notification too', async () => {
        const phases: string[] = [];
        await runWithCallTag(7, () =>
            withPhaseSinks([(line) => phases.push(line)], async () => tellDaLiveSignedOut(MESSAGE)),
        );

        expect(phases).toStrictEqual([MESSAGE]);
        expect(mockShowWarningMessage).toHaveBeenCalledWith(MESSAGE, SIGN_IN_TO_DA_LIVE);
    });
});

describe('registerDaLiveForcedSignInWatch', () => {
    it('hands the Adobe sign-in a watch that reads the DA.live sign-in around a forced one', async () => {
        jest.clearAllMocks();
        mockShowWarningMessage.mockResolvedValue(undefined);
        const token = { accessToken: 'stored', expiresAt: Date.now() + 3_600_000 };
        mockCheckSignIn
            .mockResolvedValueOnce({ state: 'valid', token })
            .mockResolvedValueOnce({ state: 'refused', token });
        let registered: ForcedSignInWatch | undefined;
        const dispose = jest.fn();

        const handle = registerDaLiveForcedSignInWatch(createMockExtensionContext(), {
            watchForcedSignIns: (watch) => {
                registered = watch;
                return { dispose };
            },
        });
        const after = await registered!();
        await after();

        expect(mockShowWarningMessage).toHaveBeenCalledWith(MESSAGE, SIGN_IN_TO_DA_LIVE);
        handle.dispose();
        expect(dispose).toHaveBeenCalledTimes(1);
    });
});
