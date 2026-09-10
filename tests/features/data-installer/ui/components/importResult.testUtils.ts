/**
 * Shared fixtures for the `importResult` suite family.
 *
 * NO jest.mock here, and none needed: `importResult` is pure — no React, no
 * requests — so what the suites actually share is FIXTURES. Both of them build
 * a `DataInstallerRequest` in each of its three states and an `ImportJobRecord`
 * with eight required fields, and two hand-rolled copies of the record shape is
 * how a fixture starts describing a type that no longer exists.
 */

import type { DataTypeStatus, ImportJobRecord } from '@/features/data-installer/types';
import type { resolveResult } from '@/features/data-installer/ui/components/importResult';
import type { DataInstallerRequest } from '@/features/data-installer/ui/hooks/useDataInstallerRequest';

/** The activation the session started, so a record can match it or not. */
export const ACTIVATION = 'act-123';

/** What `resolveResult` reads, as one object. */
export type ResultSources = Parameters<typeof resolveResult>[1];

/** A request that has never run. */
export function idle<T>(): DataInstallerRequest<T> {
    return { settled: false, load: jest.fn(), loading: false, value: null, failure: null };
}

/** A request that came back with a refusal or a transport failure. */
export function failed<T>(message: string, data?: unknown): DataInstallerRequest<T> {
    return {
        settled: true,
        load: jest.fn(),
        loading: false,
        value: null,
        failure: { message, data },
    };
}

/** A request that came back with data. */
export function succeeded<T>(value: T): DataInstallerRequest<T> {
    return { settled: true, load: jest.fn(), loading: false, value, failure: null };
}

/**
 * Every request holding a STALE success, so a case that reads the wrong one
 * announces itself instead of quietly agreeing. This is the state the modal is
 * really in: `useVSCodeRequest` never clears `data`.
 */
export function sources(overrides: Partial<ResultSources> = {}): ResultSources {
    return {
        dryRun: succeeded({ valid: true }),
        start: succeeded({ activationId: 'stale-act' }),
        reset: succeeded({ activationId: 'stale-act' }),
        provision: { ...idle<never>(), settled: true },
        record: null,
        startedActivation: undefined,
        ...overrides,
    };
}

/** Sources whose requests have all never run — the record decides everything. */
export function recordOnlySources(record: ImportJobRecord): ResultSources {
    return {
        dryRun: idle<{ valid: boolean; reason?: string }>(),
        start: idle<{ activationId: string }>(),
        reset: idle<{ activationId: string }>(),
        provision: idle<never>(),
        record,
        startedActivation: ACTIVATION,
    };
}

/** A finished job, shaped as the record store holds one. */
export function jobRecord(overrides: Partial<ImportJobRecord> = {}): ImportJobRecord {
    return {
        activationId: ACTIVATION,
        datapackName: 'bodea-full',
        version: '1.0.0',
        commerceInstance: 'https://commerce.example.com',
        dataTypes: ['categories', 'products'],
        startedAt: '2026-09-01T00:00:00.000Z',
        outcome: 'success',
        perType: { categories: 'success' as DataTypeStatus },
        ...overrides,
    };
}
