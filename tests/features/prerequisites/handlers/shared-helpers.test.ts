/**
 * Prerequisites Handlers — the pure helpers in shared.ts, decision by decision
 * (PL-22, MUT-01).
 *
 * Nothing under tests/features/prerequisites/handlers called these directly;
 * they were reached only through checkHandler, which is measured separately.
 * Each case here pins one decision: which Node majors a per-node prerequisite
 * needs, how the progress line and version suffix are built, and which status
 * and message a prerequisite gets from its installation state.
 */

import {
    determinePrerequisiteStatus,
    formatProgressMessage,
    formatVersionSuffix,
    getNodeVersionKeys,
    getPluginNodeVersions,
    getPrerequisiteDisplayMessage,
    getPrerequisiteStatusMessage,
    hasNodeVersions,
    resolveRequiredMajors,
} from '@/features/prerequisites/handlers/shared';
import type { PrerequisiteDefinition } from '@/features/prerequisites/services/PrerequisitesManager';

const node = {
    id: 'node',
    name: 'Node.js',
    check: { command: 'node --version' },
} as PrerequisiteDefinition;
const git = {
    id: 'git',
    name: 'Git',
    check: { command: 'git --version' },
} as PrerequisiteDefinition;

describe('hasNodeVersions / getNodeVersionKeys', () => {
    it('an empty mapping has no versions; one entry is enough', () => {
        expect(hasNodeVersions({})).toBe(false);
        expect(hasNodeVersions({ '20': 'commerce-mesh' })).toBe(true);
    });

    it('orders majors numerically, so 8 comes before 20 and 24', () => {
        expect(getNodeVersionKeys({ '24': 'headless', '8': 'legacy', '20': 'mesh' })).toEqual([
            '8',
            '20',
            '24',
        ]);
    });

    it('sorts rather than trusting key order, which only a padded key can show', () => {
        // The case above proves nothing about the comparator: JavaScript already
        // enumerates plain integer keys ascending, so the sort is invisible there
        // and deleting it passes. A key that is not a canonical array index — '08'
        // — is enumerated LAST instead, and is the only input that tells a real
        // numeric sort apart from no sort at all.
        expect(getNodeVersionKeys({ '20': 'mesh', '08': 'legacy', '9': 'old' })).toEqual([
            '08',
            '9',
            '20',
        ]);
    });
});

describe('resolveRequiredMajors', () => {
    const nameMapping = { '20': 'Commerce Mesh', '24': 'Headless' };
    const idMapping = { '20': 'commerce-mesh', '24': 'headless' };

    it("the prerequisite's own requiredFor wins over its plugins", () => {
        const majors = resolveRequiredMajors(
            { requiredFor: ['headless'], plugins: [{ requiredFor: ['commerce-mesh'] }] },
            nameMapping,
            idMapping
        );
        expect(majors).toEqual(['24']);
    });

    it.each([
        ['undefined', undefined],
        ['empty', []],
    ])('with requiredFor %s, the union of the plugins decides', (_name, requiredFor) => {
        const majors = resolveRequiredMajors(
            {
                requiredFor,
                plugins: [
                    { requiredFor: ['commerce-mesh'] },
                    { requiredFor: [] },
                    {},
                    { requiredFor: ['commerce-mesh'] },
                ],
            },
            nameMapping,
            idMapping
        );
        expect(majors).toEqual(['20']);
    });

    it('with nothing required by prerequisite or plugins, every Node major is required', () => {
        expect(
            resolveRequiredMajors({ plugins: [{ requiredFor: [] }, {}] }, nameMapping, idMapping)
        ).toEqual(['20', '24']);
        expect(resolveRequiredMajors({ requiredFor: [] }, nameMapping, idMapping)).toEqual([
            '20',
            '24',
        ]);
        expect(resolveRequiredMajors({}, { '24': 'Headless', '20': 'Mesh' }, idMapping)).toEqual([
            '20',
            '24',
        ]);
    });

    it('a component nothing in the stack uses yields no majors, not all of them', () => {
        expect(resolveRequiredMajors({ requiredFor: ['unknown'] }, nameMapping, idMapping)).toEqual(
            []
        );
    });
});

describe('getPluginNodeVersions', () => {
    it('a major shared by several components is required when ANY of them needs the plugin', () => {
        expect(
            getPluginNodeVersions({ '20': 'eds,commerce-mesh', '24': 'headless' }, [
                'commerce-mesh',
            ])
        ).toEqual(['20']);
    });
});

describe('formatProgressMessage', () => {
    it('names every major when Node is checked for more than one', () => {
        expect(formatProgressMessage(node, { '24': 'Headless', '20': 'Mesh' })).toBe(
            'Checking Node.js (v20, v24)...'
        );
    });

    it.each([
        ['Node with a single major', node, { '20': 'Mesh' }],
        ['Node with no mapping', node, {}],
        ['a non-Node prerequisite, whatever the mapping', git, { '20': 'Mesh', '24': 'Headless' }],
    ])('is the plain line for %s', (_name, prereq, mapping) => {
        expect(formatProgressMessage(prereq, mapping)).toBe(`Checking ${prereq.name}...`);
    });
});

describe('formatVersionSuffix', () => {
    const statuses = (...installed: boolean[]) =>
        installed.map((ok, i) => ({ version: `Node ${[20, 24, 18][i]}`, installed: ok }));

    it('lists only the installed versions, as v-prefixed majors', () => {
        expect(formatVersionSuffix(node, statuses(true, false, true), '1.0.0')).toBe(': v20, v18');
        expect(formatVersionSuffix(node, statuses(true, true), '1.0.0')).toBe(': v20, v24');
    });

    it.each([
        ['none of several Node versions is installed', node, statuses(false, false)],
        ['Node has a single status entry, even an installed one', node, statuses(true)],
        ['Node has no status', node, undefined],
        ['the prerequisite is not Node', git, statuses(true, true)],
    ])('falls back to the default version when %s', (_name, prereq, status) => {
        expect(formatVersionSuffix(prereq, status, '1.0.0')).toBe(': 1.0.0');
    });

    it('is empty with nothing to show', () => {
        expect(formatVersionSuffix(git, undefined)).toBe('');
    });
});

describe('determinePrerequisiteStatus', () => {
    it.each([
        [true, false, 'success'],
        [true, true, 'success'],
        [false, true, 'warning'],
        [false, false, 'error'],
    ])('installed=%s optional=%s -> %s', (installed, optional, expected) => {
        expect(determinePrerequisiteStatus(installed, optional)).toBe(expected);
    });
});

describe('getPrerequisiteStatusMessage', () => {
    it('names the majors a per-node variant is missing from, even if otherwise installed', () => {
        expect(
            getPrerequisiteStatusMessage('Adobe I/O CLI', true, '10.0.0', true, ['20', '24'])
        ).toBe('Adobe I/O CLI is missing in Node 20, 24');
    });

    it.each([
        ['the missing flag is set but no majors are listed', true, []],
        ['majors are listed but the flag is not set', false, ['20']],
        ['neither is given', undefined, undefined],
    ])('reports installation when %s', (_name, missing, majors) => {
        expect(getPrerequisiteStatusMessage('Git', true, '2.40', missing, majors)).toBe(
            'Git is installed: 2.40'
        );
    });

    it('installed without a version, and not installed', () => {
        expect(getPrerequisiteStatusMessage('Git', true)).toBe('Git is installed');
        expect(getPrerequisiteStatusMessage('Git', false, '2.40')).toBe('Git is not installed');
    });
});

describe('getPrerequisiteDisplayMessage', () => {
    const entry = { version: 'Node 20', major: '20', component: '', installed: true };

    it('a per-node prerequisite with any status entries gets the versions header', () => {
        expect(
            getPrerequisiteDisplayMessage('Adobe I/O CLI', true, [entry], true, ['24'], false)
        ).toBe('Installed for versions:');
    });

    it('a per-node prerequisite with no entries and missing variants explains the deferral', () => {
        expect(
            getPrerequisiteDisplayMessage('Adobe I/O CLI', true, [], true, ['20', '24'], false)
        ).toBe(
            'Adobe I/O CLI is missing in Node 20, 24. Plugin status will be checked after CLI is installed.'
        );
    });

    it.each([
        ['per-node, no entries, nothing missing', true, [], false],
        ['not per-node, even with entries', false, [entry], false],
        ['not per-node, even with variants missing', false, [], true],
    ])('otherwise it is the plain status message (%s)', (_name, perNode, entries, missing) => {
        expect(
            getPrerequisiteDisplayMessage('Git', perNode, entries, missing, ['20'], true, '2.40')
        ).toBe('Git is installed: 2.40');
    });
});
