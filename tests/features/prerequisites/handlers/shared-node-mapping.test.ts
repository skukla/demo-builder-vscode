import { getNodeVersionMapping } from '@/features/prerequisites/handlers/shared';
import { demoBuilderNode } from '@/features/components/services/nodeRequirements';
import { createPrereqHandlerContext, createComponentSelection } from './testHelpers';

/**
 * Prerequisites Handlers - Node Version Mapping
 *
 * Since PR-1a the catalog carries no Node: every component Demo Builder ships runs
 * on one, so the mapping is that one Node, labelled for the prerequisites screen,
 * whatever the stack. The tests that fed per-component versions through a mocked
 * registry went with `getNodeVersionToComponentMapping`.
 */

describe('Prerequisites Handlers - getNodeVersionMapping', () => {
    it('is empty before a stack is chosen', async () => {
        const context = createPrereqHandlerContext();

        await expect(getNodeVersionMapping(context)).resolves.toStrictEqual({});
    });

    it("maps Demo Builder's Node once a stack is chosen", async () => {
        const context = createPrereqHandlerContext({
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection({
                    frontend: 'react-app',
                    backend: 'commerce-paas',
                }),
            },
        });

        await expect(getNodeVersionMapping(context)).resolves.toStrictEqual({
            [demoBuilderNode()]: 'Demo Builder',
        });
    });

    it('gives the same answer whatever the stack', async () => {
        const context = createPrereqHandlerContext({
            sharedState: {
                isAuthenticating: false,
                currentComponentSelection: createComponentSelection({
                    frontend: 'react-spa',
                    backend: 'nodejs-api',
                    dependencies: ['dep1', 'dep2'],
                    integrations: ['commerce-mesh'],
                }),
            },
        });

        await expect(getNodeVersionMapping(context)).resolves.toStrictEqual({
            [demoBuilderNode()]: 'Demo Builder',
        });
    });
});
