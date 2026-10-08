/**
 * The one Node Demo Builder ships on (PR-1a), read against the REAL generated file
 * and the REAL App Builder catalog: an edit that changes an answer fails here.
 */

import generated from '@/core/shell/config/node-version.generated.json';
import { getAppBuilderComponentEntry } from '@/features/components/services/appBuilderComponentCatalogLoader';
import {
    demoBuilderNode,
    nodeForAppBuilderEntry,
} from '@/core/shell/demoBuilderNode';

describe('demoBuilderNode', () => {
    it('answers the node the release script wrote to the generated file', () => {
        expect(demoBuilderNode()).toBe(generated.node);
    });
});

describe('nodeForAppBuilderEntry', () => {
    it("gives a bundled entry, which carries no Node of its own, Demo Builder's Node", () => {
        const shell = getAppBuilderComponentEntry('app-builder-shell');

        expect(shell?.nodeVersion).toBeUndefined();
        expect(shell && nodeForAppBuilderEntry(shell)).toBe(demoBuilderNode());
    });

    it("keeps the Node a custom integration was given when it was added", () => {
        expect(nodeForAppBuilderEntry({ nodeVersion: '22.11.0' })).toBe('22.11.0');
    });

    it("falls back to Demo Builder's Node when the entry says nothing", () => {
        expect(nodeForAppBuilderEntry({})).toBe(demoBuilderNode());
    });
});
