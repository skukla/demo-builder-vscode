/**
 * The shared Commerce credential service, as it appears in the report.
 *
 * The probe decides the verdict; this pins what a person actually READS, because
 * the whole reason the section exists is that four states currently arrive at the
 * import screen looking identical. If the rendering collapses them again, the
 * probe's correctness buys nothing.
 *
 * It also pins the leak guard: the endpoint is an internal Runtime address and
 * the body it serves is a live Commerce credential, and this report has a
 * one-click Copy button.
 */

import { buildSummaryLines } from '@/commands/diagnostics';
import type { DiagnosticsReport } from '@/commands/diagnostics';
import type { CredentialServiceProbeResult } from '@/features/data-installer/services/credentialServiceProbe';

const ENDPOINT = 'https://285361-somewhere-stage.adobeioruntime.net/api/v1/web/x/get-commerce-credentials';

function makeReport(credentialService?: CredentialServiceProbeResult): DiagnosticsReport {
    return {
        timestamp: '2026-08-16T00:00:00Z',
        system: { platform: 'darwin', release: '25.6.0' },
        vscode: { version: '1.99.0' },
        tools: { node: { installed: true, output: 'v22.0.0', duration: 1 } },
        adobe: { installed: true, version: '11.1.2', authConfigured: true, tokenExpired: false },
        environment: {},
        tests: {
            browserLaunch: { available: true },
            adobeLoginCommand: { available: true },
            fileSystem: { canWrite: true },
        },
        mcp: { running: true, tools: ['sign_in'], hasSignIn: true },
        githubCredential: { verdict: 'fine' },
        ...(credentialService ? { credentialService } : {}),
    } as unknown as DiagnosticsReport;
}

const summary = (probe?: CredentialServiceProbeResult): string =>
    buildSummaryLines(makeReport(probe)).join('\n');

describe('credential service section', () => {
    it('is absent when the probe did not run', () => {
        expect(summary()).not.toContain('Commerce credential service');
    });

    it('reports a working service, with the org it used', () => {
        const text = summary({
            configured: true,
            orgId: '285361',
            endpoint: { httpStatus: 200 },
            verdict: 'Shared credential available — projects without their own Adobe workspace can import sample data.',
        });

        expect(text).toContain('Commerce credential service (shared):');
        expect(text).toContain('Configured: yes (org 285361)');
        expect(text).toContain('Endpoint: HTTP 200');
        expect(text).toContain('→ Shared credential available');
    });

    // Nothing configured must name the setting. "Not configured" with no remedy
    // sends the user back to the same dead end the section exists to remove.
    it('names the setting when nothing is configured', () => {
        const text = summary({
            configured: false,
            reason: 'none-configured',
            verdict:
                'No credential service is configured, so a project without its own Adobe workspace cannot import sample data. Add one under demoBuilder.accsDiscovery.services.',
        });

        expect(text).toContain('Configured: no');
        expect(text).toContain('demoBuilder.accsDiscovery.services');
        expect(text).not.toContain('Endpoint:');
    });

    // The state this section is worth its cost for.
    it('distinguishes a refusal from an outage', () => {
        const refused = summary({
            configured: true,
            endpoint: { httpStatus: 403 },
            verdict: 'Your account is not authorized for the shared credential. Ask the service administrator to add your email domain, or add a client id and secret to this project.',
        });
        const down = summary({
            configured: true,
            endpoint: { error: 'timed out' },
            verdict: 'Could not reach the credential service. It may be down, or the configured URL may be wrong.',
        });

        expect(refused).toContain('Endpoint: HTTP 403');
        expect(refused).toContain('administrator');
        expect(down).toContain('Endpoint: unreachable (timed out)');
        expect(down).not.toContain('administrator');
    });

    /**
     * The report has a one-click Copy button and gets pasted into tickets.
     * Neither the internal endpoint nor anything credential-shaped may ride along.
     */
    it('never prints the endpoint URL', () => {
        const text = summary({
            configured: true,
            orgId: '285361',
            endpoint: { httpStatus: 200 },
            verdict: 'Shared credential available.',
        });

        expect(text).not.toContain(ENDPOINT);
        expect(text).not.toContain('adobeioruntime.net');
    });

    // CONTROL: the section really is in the text, so the absence above is a
    // property of the renderer and not of an empty summary.
    it('CONTROL — the section is present when it should be', () => {
        const text = summary({
            configured: true,
            endpoint: { httpStatus: 200 },
            verdict: 'Shared credential available.',
        });

        expect(text).toContain('Commerce credential service (shared):');
    });
});
