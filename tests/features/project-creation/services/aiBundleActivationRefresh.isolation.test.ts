/**
 * Structural pin, split from aiBundleActivationRefresh.test.ts at the
 * max-lines cap: the sweep must never depend on the extension's state manager
 * (read-only project loading via ProjectFileLoader) — asserted against the
 * module source, with a positive control on the loader import.
 */

import { readFileSync } from 'fs';
import * as path from 'path';

// ─── StateManager isolation: structural assertion on the module source ───────

describe('state-manager isolation', () => {
    const MODULE_SOURCE = readFileSync(
        path.join(
            __dirname,
            '../../../../src/features/project-creation/services/aiBundleActivationRefresh.ts'
        ),
        'utf-8'
    );

    it('imports nothing from the state manager (read-only project loading)', () => {
        // The sweep must never set state.currentProject or persist through the
        // extension's state layer — it loads read-only via ProjectFileLoader.
        expect(MODULE_SOURCE).not.toMatch(/from\s+'[^']*stateManager'/i);
    });

    it('positive control: the same import scan sees the loader import', () => {
        // Proves the regex above scans real import lines at the right scope —
        // a "nothing found" without this control would prove nothing.
        expect(MODULE_SOURCE).toMatch(/from\s+'[^']*projectFileLoader'/);
    });
});
