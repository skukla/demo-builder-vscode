/**
 * Diagnostics learns the storefront's origin and Demo Builder's fixes (EDS-13f
 * step 07, decision 8). The section IS the storefront report's rendering, so
 * the command, the agent tool and a pasted ticket say the same things; the
 * ticket adds each fix's id and state, which a person debugging needs and an
 * SC-facing card never shows.
 */

import { buildSummaryLines, makeTypedReport, section } from './diagnosticsReport.testUtils';
import type { StorefrontReport } from '@/features/eds/services/storefront/storefrontReport';

const TITLE = "Storefront origin and Demo Builder's fixes:";

const REPORT: StorefrontReport = {
    repository: { owner: 'steve', repo: 'aistore-copy' },
    boilerplate: { status: 'read', value: { name: '@adobe/aem-boilerplate-commerce', version: '4.0.1' } },
    current: { status: 'read', value: { name: '@adobe/aem-boilerplate-commerce', version: '6.0.0' } },
    origin: { kind: 'added', lineage: { status: 'absent' } },
    written: { smart404: 'present', fstab: 'present', config: 'unreadable', description: 'absent' },
    fixes: [
        { patchId: 'pdp-empty-data-redirect', target: 'blocks/product-details/product-details.js', state: 'fits' },
        { patchId: 'header-nav-tools-defensive', target: 'blocks/header/header.js', state: 'applied' },
    ],
};

describe('the storefront origin section', () => {
    it('renders the report in its own words, indented under its headings, then each fix by id', () => {
        expect(section(buildSummaryLines(makeTypedReport({ storefrontOrigin: REPORT })), TITLE)).toStrictEqual([
            TITLE,
            '  Where this storefront comes from',
            "    Built on Adobe's Commerce boilerplate 4.0.1. Demo Builder's current one is 6.0.0.",
            "    GitHub records no template or fork for it, and it is not tied to Demo Builder's templates.",
            '  What Demo Builder wrote',
            '    Product-page fallback (smart 404): there.',
            '    Content mount (fstab.yaml): there.',
            '    Store settings (config.json): could not read.',
            '    Demo package description: not there.',
            "  Demo Builder's fixes",
            '    Already on the code: header and account sidebar robustness.',
            '    Fit, not applied: empty product pages.',
            '    pdp-empty-data-redirect: fits',
            '    header-nav-tools-defensive: applied',
        ]);
    });

    it('is absent without an EDS project', () => {
        expect(buildSummaryLines(makeTypedReport())).not.toContain(TITLE);
    });
});
