/**
 * Diagnostics learns the storefront's origin (EDS-13f step 07, decision 8). The
 * section IS the storefront report's rendering, so the command, the agent tool and
 * a pasted ticket say the same things. Demo Builder's fixes left the report on
 * 2026-10-23 (EDS-64), and with them the per-fix lines this section added.
 */

import { buildSummaryLines, makeTypedReport, section } from './diagnosticsReport.testUtils';
import type { StorefrontReport } from '@/features/eds/services/storefront/storefrontReport';

const TITLE = 'Storefront origin:';

const REPORT: StorefrontReport = {
    repository: { owner: 'steve', repo: 'aistore-copy' },
    boilerplate: { status: 'read', value: { name: '@adobe/aem-boilerplate-commerce', version: '4.0.1' } },
    current: { status: 'read', value: { name: '@adobe/aem-boilerplate-commerce', version: '6.0.0' } },
    origin: { kind: 'added', lineage: { status: 'absent' } },
    written: { smart404: 'present', fstab: 'present', config: 'unreadable', description: 'absent' },
};

describe('the storefront origin section', () => {
    it('renders the report in its own words, indented under its headings', () => {
        expect(section(buildSummaryLines(makeTypedReport({ storefrontOrigin: REPORT })), TITLE)).toStrictEqual([
            TITLE,
            '  Where this storefront comes from',
            "    Built on Adobe's Commerce boilerplate 4.0.1. Demo Builder's current one is 6.0.0. " +
                'Built on an older boilerplate (4.x) than Demo Builder tests on.',
            "    GitHub records no template or fork for it, and it is not tied to Demo Builder's templates.",
            '  What Demo Builder wrote',
            '    Product-page fallback (smart 404): there.',
            '    Content mount (fstab.yaml): there.',
            '    Store settings (config.json): could not read.',
            '    Demo package description: not there.',
        ]);
    });

    // The "Needs reset" status (storefrontChanges.ts), in the report's own words, first.
    it('says the storefront needs a reset, first, when the report says so', () => {
        const lines = section(buildSummaryLines(makeTypedReport({ storefrontOrigin: { ...REPORT, needsReset: true } })), TITLE);

        expect(lines.slice(0, 3)).toStrictEqual([
            TITLE,
            "    Needs reset: Demo Builder has fixes this storefront doesn't have yet.",
            '  Where this storefront comes from',
        ]);
    });

    it('is absent without an EDS project', () => {
        expect(buildSummaryLines(makeTypedReport())).not.toContain(TITLE);
    });
});
