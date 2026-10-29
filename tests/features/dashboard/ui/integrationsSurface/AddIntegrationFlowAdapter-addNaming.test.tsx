/**
 * AddIntegrationFlowAdapter — which entry an add is NAMED after.
 *
 * The main suite pins that a catalog add posts and is reported. Both of its
 * catalog cases pick the FIRST entry, so nothing there showed that the name is
 * looked up by the id picked, or what is reported when the lookup finds nothing.
 */

import { mockPostMessage } from '../../../../helpers/webviewClientMock';
import { modalProps, renderAdapter, resetCaptured } from './AddIntegrationFlowAdapter.testUtils';

beforeEach(() => {
    jest.clearAllMocks();
    resetCaptured();
});

describe('AddIntegrationFlowAdapter — naming the add it reports', () => {
    it('names a catalog add after the entry picked, not the first in the catalog', () => {
        const onAddStarted = jest.fn();
        renderAdapter({ onAddStarted });

        modalProps().builder.onAppBuilderComponentToggle('commerce-paas-mesh', true);

        expect(onAddStarted).toHaveBeenCalledWith('commerce-paas-mesh', 'API Mesh', {
            id: 'commerce-paas-mesh',
            apis: undefined,
            name: undefined,
        });
    });

    // A stack-filtered catalog can lose the entry between render and click. The
    // add still goes, reported under the id itself.
    it('reports an add the catalog does not list under its id', () => {
        const onAddStarted = jest.fn();
        renderAdapter({ onAddStarted });

        modalProps().builder.onAppBuilderComponentToggle('not-in-catalog', true);

        expect(mockPostMessage).toHaveBeenCalledWith('addAppBuilderComponent', {
            progress: 'modal',
            id: 'not-in-catalog',
        });
        expect(onAddStarted).toHaveBeenCalledWith('not-in-catalog', 'not-in-catalog', {
            id: 'not-in-catalog',
            apis: undefined,
            name: undefined,
        });
    });
});
