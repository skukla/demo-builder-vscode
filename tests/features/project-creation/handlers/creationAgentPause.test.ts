/**
 * An agent's creation that paused on a failed step, held between tool calls (F307):
 * `create_project` answers "paused", and `continue_project_creation` answers the run.
 * Driven through the real pause: the run is a real `untilDone`, answered through the
 * same handler the wizard's buttons post to.
 */

import {
    answerPausedCreation,
    untilPausedOrEnded,
} from '@/features/project-creation/handlers/creationAgentPause';
import { CHECK_AGAIN, untilDone } from '@/features/project-creation/handlers/creationPause';
import type { StepFailure } from '@/features/project-creation/services/stepFailure';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const FAILED: StepFailure = { reason: 'The mesh could not be deployed.', retryable: false };

/** An agent's run of one step that fails `times` times; ends with 'created'. */
function agentRun(times: number) {
    const context = createMockHandlerContext();
    let left = times;
    const attempt = jest.fn(async () => (left-- > 0 ? FAILED : undefined));
    const ended = untilDone(
        {
            context,
            reporter: { pause: () => undefined },
            projectName: 'agent-demo',
            step: 'Deploying the mesh',
        },
        attempt,
    ).then(() => 'created');
    return { context, attempt, ended };
}

beforeEach(() => {
    jest.useRealTimers();
});

describe('an agent creation that pauses', () => {
    it('answers paused with the step, why and the answers, then ends once answered', async () => {
        const { context, attempt, ended } = agentRun(1);

        await expect(untilPausedOrEnded(context, 'agent-demo', ended)).resolves.toStrictEqual({
            paused: { reason: FAILED.reason, actions: [CHECK_AGAIN], canSkip: true, step: 'Deploying the mesh' },
        });
        await expect(answerPausedCreation('agent-demo', CHECK_AGAIN)).resolves.toStrictEqual({
            ended: 'created',
        });
        expect(attempt).toHaveBeenCalledTimes(2);
    });

    it('answers paused again when the step fails again', async () => {
        const { context, ended } = agentRun(2);

        await untilPausedOrEnded(context, 'agent-demo', ended);
        const again = await answerPausedCreation('agent-demo', CHECK_AGAIN);

        expect(again).toHaveProperty('paused.step', 'Deploying the mesh');
        await expect(answerPausedCreation('agent-demo', CHECK_AGAIN)).resolves.toStrictEqual({
            ended: 'created',
        });
    });

    it('refuses an answer the pause did not offer, and keeps waiting for one it did', async () => {
        const { context, ended } = agentRun(1);
        await untilPausedOrEnded(context, 'agent-demo', ended);

        await expect(answerPausedCreation('agent-demo', 'Retry')).resolves.toStrictEqual({
            error: 'Retry is not an answer to this step. Answer one of: Check Again, Skip This Step.',
        });
        await expect(answerPausedCreation('agent-demo', 'Skip This Step')).resolves.toStrictEqual({
            ended: 'created',
        });
    });

    it('answers with the end when nothing fails, and holds no run afterwards', async () => {
        const { context, ended } = agentRun(0);

        await expect(untilPausedOrEnded(context, 'agent-demo', ended)).resolves.toStrictEqual({
            ended: 'created',
        });
        await expect(answerPausedCreation('agent-demo', CHECK_AGAIN)).resolves.toStrictEqual({
            error: 'No creation of agent-demo is waiting for an answer.',
        });
    });
});
