/**
 * instanceId tests (shell instancing — Step 3)
 *
 * Pure derivation module for named AI-built integrations: name → collision-checked
 * instance id. Covers slug derivation boundary cases, the reserved-id collision
 * domain (every class — a name slugging to a catalog id would make the executor's
 * catalog-first lookup clone the WRONG repo), the evaluate shape mirrored from
 * CustomStage, and the collision-free minting used by the optional-name model.
 * No React, no wizard-state reads.
 *
 * The cases are DATA. Each group was one `it` per input asserting the identical
 * expectation shape, which is what 31 tests against 40 mutable decisions looks
 * like. Every row still reports as its own named test, so a failure names the
 * input that broke rather than the group.
 *
 * Every row asserts the WHOLE result — `toStrictEqual({ message })` rather than a
 * `toBeUndefined()` on the instance plus a `toMatch(/already used/)` on the text.
 * A full-object assertion cannot pass while the other field quietly changes, and
 * the exact copy is knowable from the source.
 */

import { COMPONENT_IDS, MESH_COMPONENT_IDS } from '@/core/constants';
import {
    mintInstance,
    deriveInstanceId,
    buildReservedIds,
    evaluateInstanceName,
    type ReservedIdInputs,
} from '@/features/project-creation/ui/components/integration-flow/instanceId';
import type { BlankInstance } from '@/features/project-creation/ui/components/integration-flow/flowStages';

/** The two inline messages, copied verbatim from the module's private constants. */
const EMPTY_SLUG_MESSAGE = 'Enter a name that includes at least one letter.';
const DUPLICATE_MESSAGE = 'That name is already used by another part of this project.';

/** The edit-mode sentinel `buildReservedIds` always adds (`RESERVED_EXISTING_KEY`). */
const EXISTING_SENTINEL = '__existing__';

function inputs(overrides: Partial<ReservedIdInputs> = {}): ReservedIdInputs {
    return {
        selectedIntegrationIds: [],
        sourceIds: [],
        catalogIds: [],
        selectedAddons: [],
        ...overrides,
    };
}

/** What the domain contains before any caller-supplied id is added. */
function bakedIn(): string[] {
    return [...Object.values(COMPONENT_IDS), EXISTING_SENTINEL];
}

const SLUGS: ReadonlyArray<readonly [string, string, string]> = [
    ['converts spaces to hyphens and lowercases', 'Firefly Image Gen', 'firefly-image-gen'],
    ['converts underscores to hyphens', 'Order_Sync', 'order-sync'],
    ['strips symbols', 'Salesforce CRM!', 'salesforce-crm'],
    ['lowercases all-caps input', 'ORDER SYNC', 'order-sync'],
    ['strips leading digits (id must start with a letter)', '2024 Reports', 'reports'],
    ['drops non-ASCII letters (unicode name → empty slug)', '日本語', ''],
    ['returns an empty slug for symbols-only input', '!!!', ''],
    ['returns an empty slug for digits-only input', '123', ''],
    ['collapses consecutive separators to a single hyphen', 'Order  -  Sync', 'order-sync'],
    // The ONLY decision this function owns; everything above belongs to
    // `normalizeProjectName` and is covered again in tests/core/validation/
    // normalizers.test.ts. Without the `.trim()`, the normalizer turns the
    // trailing space into a hyphen it then keeps: 'order-sync-'.
    ['trims first, so no trailing hyphen survives the padding', '  Order Sync  ', 'order-sync'],
];

describe('deriveInstanceId', () => {
    it.each(SLUGS)('%s', (_label, raw, expected) => {
        expect(deriveInstanceId(raw)).toBe(expected);
    });
});

const RESERVED_CLASSES: ReadonlyArray<
    readonly [string, Partial<ReservedIdInputs>, readonly string[]]
> = [
    ['selected integration ids', { selectedIntegrationIds: ['order-sync'] }, ['order-sync']],
    [
        'custom-source map keys (Object.keys(appBuilderComponentSources))',
        { sourceIds: ['firefly-image-gen'] },
        ['firefly-image-gen'],
    ],
    [
        'every app-builder catalog id (wrong-repo clone guard)',
        { catalogIds: ['app-builder-shell', 'commerce-events'] },
        ['app-builder-shell', 'commerce-events'],
    ],
    ['selected addon ids', { selectedAddons: ['demo-inspector'] }, ['demo-inspector']],
    [
        'all four caller-supplied classes at once',
        {
            selectedIntegrationIds: ['order-sync'],
            sourceIds: ['firefly-image-gen'],
            catalogIds: ['app-builder-shell'],
            selectedAddons: ['demo-inspector'],
        },
        ['order-sync', 'firefly-image-gen', 'app-builder-shell', 'demo-inspector'],
    ],
];

describe('buildReservedIds', () => {
    // The expectation is the EXACT set, not a `.has()` probe: a probe passes for
    // a domain that reserved far more than it should, and over-reserving rejects
    // names the SC is entitled to use.
    it.each(RESERVED_CLASSES)('reserves %s', (_label, overrides, added) => {
        expect(buildReservedIds(inputs(overrides))).toEqual(new Set([...bakedIn(), ...added]));
    });

    it('bakes in exactly the component ids plus the __existing__ edit-mode key', () => {
        expect(buildReservedIds(inputs())).toEqual(new Set(bakedIn()));
    });

    // Mesh ids ARE component ids, so the baked-in domain already covers them.
    // This is the guarantee the caller depends on, asserted independently of how
    // buildReservedIds happens to assemble the set.
    it('reserves every mesh component id', () => {
        const reserved = buildReservedIds(inputs());
        for (const id of MESH_COMPONENT_IDS) {
            expect(reserved.has(id)).toBe(true);
        }
    });
});

const INCOMPLETE: ReadonlyArray<readonly [string, string]> = [
    ['empty input', ''],
    ['whitespace-only input', '   '],
];

const REJECTED: ReadonlyArray<
    readonly [string, string, Partial<ReservedIdInputs>, string]
> = [
    ['a symbols-only name', '!!!', {}, EMPTY_SLUG_MESSAGE],
    ['a name with no ASCII letters', '日本語', {}, EMPTY_SLUG_MESSAGE],
    ['a digits-only name', '2024', {}, EMPTY_SLUG_MESSAGE],
    [
        'a name slugging to a catalog id (the wrong-repo clone case)',
        'App Builder Shell',
        { catalogIds: ['app-builder-shell'] },
        DUPLICATE_MESSAGE,
    ],
    ['a name slugging to a mesh component id', 'EDS Commerce Mesh', {}, DUPLICATE_MESSAGE],
    ['a name slugging to eds-storefront', 'EDS Storefront', {}, DUPLICATE_MESSAGE],
    [
        'a name slugging to an already-selected instance id',
        'Order Sync',
        { selectedIntegrationIds: ['order-sync'] },
        DUPLICATE_MESSAGE,
    ],
    [
        'a name slugging to a custom-source key',
        'Order Sync',
        { sourceIds: ['order-sync'] },
        DUPLICATE_MESSAGE,
    ],
    [
        'a name slugging to a selected addon id',
        'Demo Inspector',
        { selectedAddons: ['demo-inspector'] },
        DUPLICATE_MESSAGE,
    ],
];

const ACCEPTED: ReadonlyArray<
    readonly [string, string, Partial<ReservedIdInputs>, BlankInstance]
> = [
    [
        'trims the display name and derives the id from it',
        '  Firefly Image Gen  ',
        {},
        { id: 'firefly-image-gen', name: 'Firefly Image Gen' },
    ],
    [
        'is unaffected by reserved ids it does not collide with',
        'Order Sync',
        { selectedIntegrationIds: ['other-app'], catalogIds: ['app-builder-shell'] },
        { id: 'order-sync', name: 'Order Sync' },
    ],
];

describe('evaluateInstanceName', () => {
    // Nothing typed yet is not an error: no instance AND no message, so the
    // field shows no red text before the SC has finished typing.
    it.each(INCOMPLETE)('treats %s as merely incomplete', (_label, raw) => {
        expect(evaluateInstanceName(raw, new Set<string>())).toStrictEqual({});
    });

    it.each(REJECTED)('rejects %s', (_label, raw, overrides, message) => {
        expect(evaluateInstanceName(raw, buildReservedIds(inputs(overrides)))).toStrictEqual({
            message,
        });
    });

    it.each(ACCEPTED)('accepts a valid name and %s', (_label, raw, overrides, instance) => {
        expect(evaluateInstanceName(raw, buildReservedIds(inputs(overrides)))).toStrictEqual({
            instance,
        });
    });
});

const MINTED: ReadonlyArray<readonly [string, string, readonly string[], BlankInstance]> = [
    [
        'mints the slugged label when it is free',
        'Order Sync',
        ['other'],
        { id: 'order-sync', name: 'Order Sync' },
    ],
    [
        'silently suffixes BOTH id and display name on a collision — never an error',
        'Custom Integration',
        ['custom-integration'],
        { id: 'custom-integration-2', name: 'Custom Integration 2' },
    ],
    [
        'keeps counting past existing suffixes',
        'Custom Integration',
        ['custom-integration', 'custom-integration-2'],
        { id: 'custom-integration-3', name: 'Custom Integration 3' },
    ],
    // The id slugs whitespace away either way; the display name is what the SC
    // reads on the card, so stray padding must not survive into it.
    [
        'trims the label before it becomes the DISPLAY name',
        '  Order Sync  ',
        [],
        { id: 'order-sync', name: 'Order Sync' },
    ],
    [
        'trims before appending a collision suffix to the display name',
        '  Order Sync  ',
        ['order-sync'],
        { id: 'order-sync-2', name: 'Order Sync 2' },
    ],
    [
        'falls back to the custom-integration stem when the label has no usable letters',
        '123',
        [],
        { id: 'custom-integration', name: '123' },
    ],
    // The two branches combined, which no row above reaches: the FALLBACK stem is
    // itself taken. The id suffixes off the stem, but the display name suffixes
    // off the label the SC actually typed — so it reads '123 2', not
    // 'custom-integration 2'.
    [
        'suffixes off the stem for the id and off the label for the name when both apply',
        '123',
        ['custom-integration'],
        { id: 'custom-integration-2', name: '123 2' },
    ],
];

describe('mintInstance (optional-name model, 2026-08-27)', () => {
    it.each(MINTED)('%s', (_label, label, reserved, expected) => {
        expect(mintInstance(label, new Set(reserved))).toStrictEqual(expected);
    });
});
