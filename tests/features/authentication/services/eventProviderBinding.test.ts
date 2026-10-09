/**
 * Event-provider ownership rule tests: the provider kind teardown may consider,
 * and the project/workspace binding parsed from a provider's `rel:update` href
 * (absolute/relative/query, malformed or traversal-shaped → undefined, never deleted).
 */

import {
    THIRD_PARTY_PROVIDER_METADATA,
    parseProviderBinding,
} from '@/features/authentication/services/eventProviderBinding';

describe('THIRD_PARTY_PROVIDER_METADATA', () => {
    it('matches the custom-events provider_metadata discriminator', () => {
        expect(THIRD_PARTY_PROVIDER_METADATA).toBe('3rd_party_custom_events');
    });
});

describe('parseProviderBinding', () => {
    it('parses an absolute rel:update href', () => {
        const binding = parseProviderBinding(
            'https://api.adobe.io/events/org-1/proj-1/ws-1/providers/prov-1',
        );

        expect(binding).toEqual({
            providerId: 'prov-1',
            projectId: 'proj-1',
            workspaceId: 'ws-1',
        });
    });

    it('parses a relative rel:update href', () => {
        const binding = parseProviderBinding('/events/org-1/proj-1/ws-1/providers/prov-1');

        expect(binding).toEqual({
            providerId: 'prov-1',
            projectId: 'proj-1',
            workspaceId: 'ws-1',
        });
    });

    it('tolerates a query-string suffix', () => {
        const binding = parseProviderBinding(
            '/events/org-1/proj-1/ws-1/providers/prov-1?eventmetadata=true',
        );

        expect(binding).toEqual({
            providerId: 'prov-1',
            projectId: 'proj-1',
            workspaceId: 'ws-1',
        });
    });

    it('returns undefined for a wrong path shape (missing workspace segment)', () => {
        expect(parseProviderBinding('/events/org-1/proj-1/providers/prov-1')).toBeUndefined();
    });

    it('returns undefined for a path with trailing extra segments', () => {
        expect(
            parseProviderBinding('/events/org-1/proj-1/ws-1/providers/prov-1/extra'),
        ).toBeUndefined();
    });

    it('returns undefined for an empty href', () => {
        expect(parseProviderBinding('')).toBeUndefined();
    });

    it('returns undefined for an unrelated URL', () => {
        expect(
            parseProviderBinding('https://api.adobe.io/console/organizations/org-1'),
        ).toBeUndefined();
    });

    it('returns undefined when any segment is a traversal-shaped ".." (never deleted)', () => {
        expect(parseProviderBinding('/events/org-1/../ws-1/providers/prov-1')).toBeUndefined();
        expect(parseProviderBinding('/events/org-1/proj-1/../providers/prov-1')).toBeUndefined();
        expect(parseProviderBinding('/events/org-1/proj-1/ws-1/providers/..')).toBeUndefined();
    });

    it('still parses UUID-shaped provider ids', () => {
        const binding = parseProviderBinding(
            '/events/org-1/proj-1/ws-1/providers/8a4f6a2e-1b3c-4d5e-9f0a-b1c2d3e4f5a6',
        );

        expect(binding?.providerId).toBe('8a4f6a2e-1b3c-4d5e-9f0a-b1c2d3e4f5a6');
    });
});
