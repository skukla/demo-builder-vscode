/**
 * The storefront setup's steps (progress vocabulary slice 4, owner 2026-10-16): the
 * list the wizard numbers "(n of N)" from, and what each progress push becomes on its
 * way to the wizard and an agent. Line 1 is a step from the stage table (Reset's name
 * where the work is the same); line 2 is what it is doing now; the run's start rides
 * along for the screen's clock.
 */
import { OPERATION_STAGES as S } from '@/core/utils/operationStages';
import {
    storefrontSetupSteps,
    withSetupSteps,
} from '@/features/eds/handlers/storefrontSetup/storefrontSetupProgress';
import type { StorefrontSetupProgressPayload } from '@/types/webviewPayloads';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';

const STARTED_AT = 1_760_000_000_000;

describe('storefrontSetupSteps', () => {
    it("lists a new storefront's steps in the order setup runs them", () => {
        expect(storefrontSetupSteps({ clearsContent: false, copiesContent: true })).toStrictEqual([
            S.settingUpRepository.label,
            S.settingUpCode.label,
            S.publishingCodeAndSettings.label,
            S.copyingContent.label,
            S.settingUpAuthoring.label,
            S.publishingPages.label,
            S.checkingCopiedPages.label,
        ]);
    });

    it('clears the old content first, and removes its pages after, when the SC chose to reset it', () => {
        expect(storefrontSetupSteps({ clearsContent: true, copiesContent: true })).toStrictEqual([
            S.settingUpRepository.label,
            S.settingUpCode.label,
            S.publishingCodeAndSettings.label,
            S.clearingOldContent.label,
            S.copyingContent.label,
            S.settingUpAuthoring.label,
            S.publishingPages.label,
            S.removingOldPages.label,
            S.checkingCopiedPages.label,
        ]);
    });

    it('leaves out the copy and the page check when the site keeps its content', () => {
        expect(storefrontSetupSteps({ clearsContent: false, copiesContent: false })).toStrictEqual([
            S.settingUpRepository.label,
            S.settingUpCode.label,
            S.publishingCodeAndSettings.label,
            S.settingUpAuthoring.label,
            S.publishingPages.label,
        ]);
    });
});

describe('withSetupSteps', () => {
    const STEPS = storefrontSetupSteps({ clearsContent: false, copiesContent: true });

    function wrapped() {
        const base = createMockHandlerContext();
        const context = withSetupSteps(base, STEPS, STARTED_AT);
        const sent = () =>
            (base.sendMessage as jest.Mock).mock.calls.map(([type, data]) => ({ type, data }));
        return { context, sent };
    }

    it("names a phase's step, numbers it, and puts the work's own line under it", async () => {
        const { context, sent } = wrapped();

        await context.sendMessage('storefront-setup-progress', {
            phase: 'repository',
            message: 'Creating the repository: my-demo',
            progress: 5,
        } satisfies StorefrontSetupProgressPayload);

        expect(sent()).toStrictEqual([
            {
                type: 'storefront-setup-progress',
                data: {
                    phase: 'repository',
                    stage: S.settingUpRepository.label,
                    position: { index: 1, total: 7 },
                    message: 'Creating the repository: my-demo',
                    progress: 5,
                    startedAt: STARTED_AT,
                },
            },
        ]);
    });

    it('takes the step a push names over its phase', async () => {
        const { context, sent } = wrapped();

        await context.sendMessage('storefront-setup-progress', {
            phase: 'storefront-code',
            stage: S.settingUpRepository.label,
            message: 'Checking AEM Code Sync',
            progress: 28,
        } satisfies StorefrontSetupProgressPayload);

        expect(sent()[0].data).toMatchObject({ stage: S.settingUpRepository.label, position: { index: 1 } });
    });

    it('says the step once: a line that repeats it keeps only its count', async () => {
        const { context, sent } = wrapped();

        await context.sendMessage('storefront-setup-progress', {
            phase: 'content',
            stage: S.copyingContent.label,
            message: 'Copying the content: 40 of 103 files',
            subMessage: '/products/index',
            progress: 54,
        } satisfies StorefrontSetupProgressPayload);

        expect(sent()[0].data).toMatchObject({ message: '40 of 103 files', position: { index: 4, total: 7 } });
        expect(sent()[0].data).not.toHaveProperty('subMessage');
    });

    // The repository is the one thing the SC might want to see while a step has
    // nothing more to say.
    it('shows the detail the push carried when its line is only the step again', async () => {
        const { context, sent } = wrapped();

        await context.sendMessage('storefront-setup-progress', {
            phase: 'publish',
            stage: S.publishingPages.label,
            message: S.publishingPages.label,
            subMessage: 'acme/shop',
            progress: 67,
        } satisfies StorefrontSetupProgressPayload);

        expect(sent()[0].data).toMatchObject({ message: 'acme/shop' });
    });

    it("fills line 2 with the step's detail when the push says nothing more", async () => {
        const { context, sent } = wrapped();

        await context.sendMessage('storefront-setup-progress', {
            phase: 'block-library',
            message: S.settingUpAuthoring.label,
            progress: 59,
        } satisfies StorefrontSetupProgressPayload);

        expect(sent()[0].data).toMatchObject({ message: S.settingUpAuthoring.detail });
    });

    it('leaves a push with no step alone: the sign-in wait and the cancel', async () => {
        const { context, sent } = wrapped();
        const waiting: StorefrontSetupProgressPayload = {
            phase: 'auth-recovery',
            message: 'DA.live session expired. Please re-authenticate to continue.',
            progress: -1,
        };

        await context.sendMessage('storefront-setup-progress', waiting);

        expect(sent()[0].data).toStrictEqual(waiting);
    });

    it('passes every other message through untouched', async () => {
        const { context, sent } = wrapped();
        const asking = { owner: 'acme', repo: 'shop', installUrl: 'https://example.test', message: 'Install it' };

        await context.sendMessage('storefront-setup-github-app-required', asking);

        expect(sent()).toStrictEqual([{ type: 'storefront-setup-github-app-required', data: asking }]);
    });
});
