/**
 * Install records as tests write them to disk, typed to the real `InstallRecord`, so a shape the
 * record does not have fails to compile (root CLAUDE.md, "A shape written where the compiler cannot
 * read it WILL be invented").
 */

import type { InstallRecord } from '@/features/data-installer/services/demoBuilderEngine/installRecord';

/** What a test varies about a record: the instance it notes, or none (a record written before). */
export type InstanceRecordFixture = Pick<InstallRecord, 'instance'>;

/** Bodea@main installed at acme / acme_en, one product made, on the instance given (step-07 D6). */
export function recordOnInstance(fixture: InstanceRecordFixture): InstallRecord {
    return {
        format: 1,
        pack: { name: 'bodea', version: 'main' },
        engine: 'demo-builder',
        startedAt: '2026-11-14T09:00:00.000Z',
        target: { websiteCode: 'acme', storeCode: 'acme_en' },
        ...(fixture.instance !== undefined ? { instance: fixture.instance } : {}),
        created: [{ kind: 'products', id: 'BOD-1' }],
    };
}
