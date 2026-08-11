/**
 * apiAccessConstants — the shared sdk-code → friendly-label map used by both the
 * informational api-access stage and the integration result row.
 */

import {
    apiLabel,
    API_LABELS,
    BASELINE_CODE,
} from '@/features/project-creation/ui/components/integration-flow/apiAccessConstants';

describe('apiAccessConstants — apiLabel', () => {
    it('names the baseline I/O Management API', () => {
        expect(apiLabel(BASELINE_CODE)).toBe('I/O Management API');
    });

    it('names known deterministic codes (API Mesh)', () => {
        expect(apiLabel('GraphQLServiceSDK')).toBe('API Mesh');
    });

    it('falls back to the raw sdk code for an unmapped pick', () => {
        expect(apiLabel('FireflyServicesSDK')).toBe('FireflyServicesSDK');
    });

    it('exposes API_LABELS with the baseline entry', () => {
        expect(API_LABELS[BASELINE_CODE]).toBe('I/O Management API');
    });
});
