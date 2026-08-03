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

const SRC = path.join(__dirname, '../../../../src');

/**
 * Everything the reused flow can send — the flow directory PLUS the components it
 * RENDERS but does not contain.
 *
 * Scanning only integration-flow/ was the blind spot that let the destination
 * pickers ship unanswered: DestinationStage renders AdobeProjectPicker /
 * AdobeWorkspacePicker / useProjectCreationPhases, and `get-projects` is sent from
 * there, so the guard saw nothing and the picker spun forever (2026-07-31).
 * Add a root here whenever the flow starts rendering something new that talks to
 * the extension.
 */
const FLOW_ROOTS = [
    'features/project-creation/ui/components/integration-flow',
    'features/authentication/ui/components/AdobeProjectPicker.tsx',
    'features/authentication/ui/components/AdobeWorkspacePicker.tsx',
    'features/project-creation/ui/hooks/useProjectCreationPhases.ts',
].map((rel) => path.join(SRC, rel));

/** Every `webviewClient.request('x')` / `.postMessage('x')` literal under the roots. */
function messageTypesIn(roots: string[]): Set<string> {
    const found = new Set<string>();
    const scanFile = (file: string): void => {
        if (!/\.tsx?$/.test(file)) return;
        const source = fs.readFileSync(file, 'utf8');
        const pattern =
            /webviewClient\s*\.\s*(?:request|postMessage)\s*(?:<[^>]*>)?\s*\(\s*'([^']+)'/g;
        for (const match of source.matchAll(pattern)) {
            found.add(match[1]);
        }
    };
    const walk = (current: string): void => {
        if (!fs.statSync(current).isDirectory()) {
            scanFile(current);
            return;
        }
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            walk(path.join(current, entry.name));
        }
    };
    roots.forEach(walk);
    return found;
}

describe('ShowIntegrationsCommand — reused-wizard-flow handler coverage', () => {
    it('the reused flow sends at least one message (guards against a vacuous test)', () => {
        // If the scan ever returns nothing, the assertion below would pass while
        // proving nothing at all.
        expect(messageTypesIn(FLOW_ROOTS).size).toBeGreaterThan(0);
    });

    it('registers EVERY message the reused add-integration flow sends', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '../../../../src/features/dashboard/commands/showIntegrations.ts'),
            'utf8'
        );

        const missing = [...messageTypesIn(FLOW_ROOTS)].filter(
            (type) => !source.includes(`'${type}'`)
        );

        expect(missing).toEqual([]);
    });

    // The ones that shipped broken, named explicitly so each regression is legible.
    it.each(['list-org-console-apis', 'get-projects', 'get-workspaces'])(
        'registers %s (the picker hung with nothing answering it)',
        (type) => {
            const source = fs.readFileSync(
                path.join(
                    __dirname,
                    '../../../../src/features/dashboard/commands/showIntegrations.ts'
                ),
                'utf8'
            );

            expect(source).toContain(`'${type}'`);
        }
    );
});
