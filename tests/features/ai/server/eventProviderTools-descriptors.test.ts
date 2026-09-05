/**
 * Event-provider tools (AB-6) — what the five tools DECLARE.
 *
 * Handler behaviour is eventProviderTools.test.ts's job. This suite asserts
 * the half a stub server usually throws away: `needsAuth` (which sign-in the
 * agent is told to offer), `annotations` (what the dry run and the consent
 * gate read), and `inputSchema` — the only validation an agent's arguments
 * ever get, so every rule in it is the tool's real input contract.
 */

import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import {
    COMPLETE_ADOBE,
    authService,
    fakeServer,
    inputFields,
    inputObject,
    eventToolsCtx,
    registerEventProviderTools,
} from './eventProviderTools.testUtils';

const server = fakeServer();
registerEventProviderTools(server, eventToolsCtx({ adobe: COMPLETE_ADOBE }), authService);

const def = (tool: string): McpToolSchema => server.definition(tool);

const TOOLS = [
    'list_event_providers',
    'create_event_provider',
    'create_event_registration',
    'delete_event_registration',
    'delete_event_provider',
] as const;

/** Arguments the schema must accept, per tool — the ordinary successful call. */
const VALID_PROVIDER = {
    providerKey: 'erp',
    label: 'ERP events',
    description: 'Orders and shipments',
    events: [{ event_code: 'com.erp.order', label: 'Order', description: 'An order' }],
};

const VALID_REGISTRATION = {
    name: 'orders',
    description: 'Order events',
    deliveryType: 'journal',
    webhookUrl: 'https://example.com/hook',
    events: [{ provider_id: 'prov-1', event_code: 'com.erp.order' }],
};

/** Whether the tool's declared schema admits these arguments. */
function admits(tool: string, args: unknown): boolean {
    return inputObject(def(tool)).safeParse(args).success;
}

describe('event provider tool declarations', () => {
    it.each(TOOLS)('%s tells the agent Adobe sign-in is what it needs', (tool) => {
        expect(def(tool).needsAuth).toEqual(['adobe']);
    });

    it('declares list as read-only and the other four as writes', () => {
        expect(def('list_event_providers').annotations).toEqual({ readOnlyHint: true });
        expect(def('create_event_provider').annotations).toEqual({
            readOnlyHint: false,
            destructiveHint: false,
        });
        expect(def('create_event_registration').annotations).toEqual({
            readOnlyHint: false,
            destructiveHint: false,
        });
    });

    it('declares both deletes as destructive, which is what gates consent', () => {
        expect(def('delete_event_registration').annotations).toEqual({
            readOnlyHint: false,
            destructiveHint: true,
        });
        expect(def('delete_event_provider').annotations).toEqual({
            readOnlyHint: false,
            destructiveHint: true,
        });
    });

    it('declares the fields each tool accepts', () => {
        expect(inputFields(def('list_event_providers'))).toEqual([]);
        expect(inputFields(def('create_event_provider'))).toEqual([
            'providerKey',
            'label',
            'description',
            'events',
        ]);
        expect(inputFields(def('create_event_registration'))).toEqual([
            'name',
            'description',
            'deliveryType',
            'webhookUrl',
            'events',
        ]);
        expect(inputFields(def('delete_event_registration'))).toEqual([
            'registrationId',
            'confirm',
        ]);
        expect(inputFields(def('delete_event_provider'))).toEqual([
            'providerId',
            'registrationIds',
            'confirm',
        ]);
    });
});

describe('create_event_provider input contract', () => {
    it('admits an ordinary call', () => {
        expect(admits('create_event_provider', VALID_PROVIDER)).toBe(true);
    });

    it('admits a provider with no description', () => {
        const { description: _description, ...rest } = VALID_PROVIDER;
        expect(admits('create_event_provider', rest)).toBe(true);
    });

    it.each([
        ['a single character', 'e'],
        ['upper case', 'ERPerp'],
        ['punctuation', 'erp!'],
        ['a space', 'erp events'],
        ['more than forty characters', 'e'.repeat(41)],
    ])('refuses a providerKey with %s — the key becomes part of an instance id', (_why, key) => {
        expect(admits('create_event_provider', { ...VALID_PROVIDER, providerKey: key })).toBe(false);
    });

    it('refuses an empty label', () => {
        expect(admits('create_event_provider', { ...VALID_PROVIDER, label: '' })).toBe(false);
    });

    it('refuses an event type that names no event code', () => {
        expect(admits('create_event_provider', { ...VALID_PROVIDER, events: [{ label: 'Order' }] })).toBe(
            false
        );
    });
});

describe('create_event_registration input contract', () => {
    it('admits an ordinary call', () => {
        expect(admits('create_event_registration', VALID_REGISTRATION)).toBe(true);
    });

    it('admits a journal registration with nothing optional set', () => {
        expect(
            admits('create_event_registration', {
                name: VALID_REGISTRATION.name,
                events: VALID_REGISTRATION.events,
            })
        ).toBe(true);
    });

    it.each(['journal', 'webhook', 'webhook_batch'])('admits %s delivery', (deliveryType) => {
        expect(admits('create_event_registration', { ...VALID_REGISTRATION, deliveryType })).toBe(true);
    });

    it('refuses a delivery type the eventing API does not have', () => {
        expect(
            admits('create_event_registration', { ...VALID_REGISTRATION, deliveryType: 'carrier-pigeon' })
        ).toBe(false);
    });

    it('refuses a webhook URL that is not a URL', () => {
        expect(admits('create_event_registration', { ...VALID_REGISTRATION, webhookUrl: 'example' })).toBe(
            false
        );
    });

    it('refuses an empty name — the name IS the find-before-create key', () => {
        expect(admits('create_event_registration', { ...VALID_REGISTRATION, name: '' })).toBe(false);
    });

    it('refuses a name longer than eighty characters', () => {
        expect(admits('create_event_registration', { ...VALID_REGISTRATION, name: 'n'.repeat(81) })).toBe(
            false
        );
    });

    it('refuses a registration that subscribes to nothing', () => {
        expect(admits('create_event_registration', { ...VALID_REGISTRATION, events: [] })).toBe(false);
    });

    it('refuses an event pair that names no provider', () => {
        expect(
            admits('create_event_registration', {
                ...VALID_REGISTRATION,
                events: [{ event_code: 'com.erp.order' }],
            })
        ).toBe(false);
    });
});
