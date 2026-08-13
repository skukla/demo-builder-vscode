/**
 * Hand-written declarations for the plain-JS drift checker so the test tree
 * typechecks (tsconfig.test.json has no allowJs). Keep in sync with the
 * JSDoc shapes in dataInstallerDrift.js.
 */

export interface DriftEntry {
    path: string;
    kind: 'missing' | 'type';
    expected: string;
    actual: string;
}

export interface EndpointResult {
    action: string;
    ok: boolean;
    drift: DriftEntry[];
    unreachable?: boolean;
    error?: string;
    status?: number;
}

export function shapeDrift(expected: unknown, actual: unknown, at?: string): DriftEntry[];

export function checkEndpoint(options: {
    action: string;
    url: string;
    fixture: unknown;
    token: string;
    fetchImpl: (url: string, init?: unknown) => Promise<{
        status: number;
        ok: boolean;
        text: () => Promise<string>;
    }>;
}): Promise<EndpointResult>;

export const ENDPOINTS: Array<{ action: string; fixture: string }>;
