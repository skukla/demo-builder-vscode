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

/** One thing a human must decide about the operation_mode surface. */
export interface ModeFinding {
    mode: string;
    kind: 'control-failed' | 'unreachable' | 'disappeared' | 'undecided';
    detail: string;
    /** Set on a failed control: every other row in the run is unreadable. */
    invalidates?: boolean;
}

export function modeFindings(
    counts: Record<string, number | null | undefined>,
): ModeFinding[];

export const DECIDED_MODES: readonly string[];
export const CANDIDATE_MODES: readonly string[];
export const CONTROL_MODE: string;
