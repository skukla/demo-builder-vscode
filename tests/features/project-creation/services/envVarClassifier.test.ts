/**
 * Env-Var Classifier Tests (D2 Track B — Step 01)
 *
 * The 3-bucket "what the user provides" rule from D1 findings §"D2 UX rule":
 *   1. auto-provisioned (skip)        — derivedFrom (e.g. connect-commerce)
 *   2. auto-wired / providedBy        — show "connected", never ask
 *   3. user-provided (ASK)            — split into userText / userSecret
 *
 * Seed meshes carry only derivedFrom:'connect-commerce' vars, so the classifier
 * yields ZERO user-input fields for them (the documented "mesh = zero new input"
 * case).
 */

import { classifyEnvSchema } from '@/features/project-creation/services/envVarClassifier';
import { getAppBuilderComponentEnvSchema } from '@/features/project-creation/services/appBuilderComponentCatalogLoader';
import type { AppBuilderComponentEnvVar } from '@/types/appBuilderComponents';

describe('classifyEnvSchema', () => {
    it('returns the four buckets, all empty, for an empty schema (Edge)', () => {
        const result = classifyEnvSchema([]);
        expect(result.autoProvisioned).toEqual([]);
        expect(result.autoWired).toEqual([]);
        expect(result.userText).toEqual([]);
        expect(result.userSecret).toEqual([]);
    });

    it('classifies a providedBy var as autoWired (never asked)', () => {
        const schema: AppBuilderComponentEnvVar[] = [
            { name: 'MESH_ENDPOINT', type: 'text', label: 'Mesh endpoint', providedBy: 'commerce-paas-mesh' },
        ];
        const result = classifyEnvSchema(schema);
        expect(result.autoWired.map(v => v.name)).toEqual(['MESH_ENDPOINT']);
        expect(result.autoProvisioned).toEqual([]);
        expect(result.userText).toEqual([]);
        expect(result.userSecret).toEqual([]);
    });

    it('carries the provider id on the autoWired var for the "connected" UI', () => {
        const schema: AppBuilderComponentEnvVar[] = [
            { name: 'MESH_ENDPOINT', type: 'text', label: 'Mesh endpoint', providedBy: 'commerce-paas-mesh' },
        ];
        const result = classifyEnvSchema(schema);
        expect(result.autoWired[0].providedBy).toBe('commerce-paas-mesh');
    });

    it('classifies a derivedFrom var as autoProvisioned (bucket 1, never asked)', () => {
        const schema: AppBuilderComponentEnvVar[] = [
            { name: 'COMMERCE_ENDPOINT', type: 'text', label: 'Commerce endpoint', derivedFrom: 'connect-commerce' },
        ];
        const result = classifyEnvSchema(schema);
        expect(result.autoProvisioned.map(v => v.name)).toEqual(['COMMERCE_ENDPOINT']);
        expect(result.userText).toEqual([]);
        expect(result.userSecret).toEqual([]);
        expect(result.autoWired).toEqual([]);
    });

    it('classifies a plain text var (no providedBy/derivedFrom) as userText', () => {
        const schema: AppBuilderComponentEnvVar[] = [
            { name: 'ERP_HOST', type: 'text', label: 'ERP host' },
        ];
        const result = classifyEnvSchema(schema);
        expect(result.userText.map(v => v.name)).toEqual(['ERP_HOST']);
        expect(result.userSecret).toEqual([]);
    });

    it('classifies a plain secret var (no providedBy/derivedFrom) as userSecret', () => {
        const schema: AppBuilderComponentEnvVar[] = [
            { name: 'ERP_API_KEY', type: 'secret', label: 'ERP API key' },
        ];
        const result = classifyEnvSchema(schema);
        expect(result.userSecret.map(v => v.name)).toEqual(['ERP_API_KEY']);
        expect(result.userText).toEqual([]);
    });

    it('classifies a mixed schema into the correct buckets', () => {
        const schema: AppBuilderComponentEnvVar[] = [
            { name: 'COMMERCE_ENDPOINT', type: 'text', label: 'Commerce', derivedFrom: 'connect-commerce' },
            { name: 'MESH_ENDPOINT', type: 'text', label: 'Mesh', providedBy: 'commerce-paas-mesh' },
            { name: 'ERP_HOST', type: 'text', label: 'ERP host' },
            { name: 'ERP_API_KEY', type: 'secret', label: 'ERP key' },
        ];
        const result = classifyEnvSchema(schema);
        expect(result.autoProvisioned.map(v => v.name)).toEqual(['COMMERCE_ENDPOINT']);
        expect(result.autoWired.map(v => v.name)).toEqual(['MESH_ENDPOINT']);
        expect(result.userText.map(v => v.name)).toEqual(['ERP_HOST']);
        expect(result.userSecret.map(v => v.name)).toEqual(['ERP_API_KEY']);
    });

    it('treats providedBy as autoWired even when the var is also a secret', () => {
        const schema: AppBuilderComponentEnvVar[] = [
            { name: 'SHARED_SECRET', type: 'secret', label: 'Shared', providedBy: 'other-appBuilderComponent' },
        ];
        const result = classifyEnvSchema(schema);
        expect(result.autoWired.map(v => v.name)).toEqual(['SHARED_SECRET']);
        expect(result.userSecret).toEqual([]);
    });

    describe('seed-mesh "zero user input" case', () => {
        it('yields zero userText/userSecret for every seeded mesh', () => {
            for (const id of ['commerce-paas-mesh', 'commerce-eds-mesh', 'headless-commerce-mesh']) {
                const result = classifyEnvSchema(getAppBuilderComponentEnvSchema(id));
                expect(result.userText).toEqual([]);
                expect(result.userSecret).toEqual([]);
            }
        });
    });
});
