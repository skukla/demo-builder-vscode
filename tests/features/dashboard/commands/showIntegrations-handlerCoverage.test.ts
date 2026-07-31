/**
 * ShowIntegrationsCommand — handler coverage for the REUSED wizard flow.
 *
 * The integrations surface renders the WIZARD's AddIntegrationFlowModal
 * (AddIntegrationFlowAdapter), so that modal's message dependencies are the
 * wizard's, not this surface's. An unregistered message type is not an error
 * here — it is SILENCE: the webview's request never resolves, and the user
 * watches a picker spin until it times out. That is exactly how
 * `list-org-console-apis` shipped broken.
 *
 * This suite reads the message types out of the reused flow's SOURCE and asserts
 * the panel registers each one, so adding a new request to that flow fails here
 * rather than in someone's Extension Host.
 */

import * as fs from 'fs';
import * as path from 'path';

const FLOW_DIR = path.join(
    __dirname,
    '../../../../src/features/project-creation/ui/components/integration-flow'
);

/** Every `webviewClient.request('x')` / `.postMessage('x')` literal in a tree. */
function messageTypesIn(dir: string): Set<string> {
    const found = new Set<string>();
    const walk = (current: string): void => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (!/\.tsx?$/.test(entry.name)) continue;
            const source = fs.readFileSync(full, 'utf8');
            const pattern =
                /webviewClient\s*\.\s*(?:request|postMessage)\s*(?:<[^>]*>)?\s*\(\s*'([^']+)'/g;
            for (const match of source.matchAll(pattern)) {
                found.add(match[1]);
            }
        }
    };
    walk(dir);
    return found;
}

describe('ShowIntegrationsCommand — reused-wizard-flow handler coverage', () => {
    it('the reused flow sends at least one message (guards against a vacuous test)', () => {
        // If the scan ever returns nothing, the assertion below would pass while
        // proving nothing at all.
        expect(messageTypesIn(FLOW_DIR).size).toBeGreaterThan(0);
    });

    it('registers EVERY message the reused add-integration flow sends', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '../../../../src/features/dashboard/commands/showIntegrations.ts'),
            'utf8'
        );

        const missing = [...messageTypesIn(FLOW_DIR)].filter(
            (type) => !source.includes(`'${type}'`)
        );

        expect(missing).toEqual([]);
    });

    // The one that shipped broken, named explicitly so the regression is legible.
    it('registers list-org-console-apis (the API picker hung without it)', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '../../../../src/features/dashboard/commands/showIntegrations.ts'),
            'utf8'
        );

        expect(source).toContain("'list-org-console-apis'");
    });
});
