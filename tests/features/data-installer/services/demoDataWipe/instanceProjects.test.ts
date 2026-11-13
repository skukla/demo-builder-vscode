/**
 * Which local projects are on the Commerce instance Clear Commerce Instance clears (step 06 C4,
 * review item 2): matched on the key a removal acts on (`deriveImportInstance`), spelled one way.
 */

import { instanceKeyOf, onSameInstance } from '@/features/data-installer/services/demoDataWipe/instanceProjects';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';

const accs = (name: string, endpoint: string): Project =>
    createMockProject({ name, path: `/nonexistent/projects/${name}`, componentConfigs: { 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: endpoint } } });
const paas = (name: string, url: string): Project =>
    createMockProject({ name, path: `/nonexistent/projects/${name}`, componentConfigs: { 'adobe-commerce-paas': { ADOBE_COMMERCE_URL: url } } });

it('matches an ACCS project by its tenant, whatever follows it', () => {
    expect(instanceKeyOf(accs('a', 'https://na1-sandbox.api.commerce.adobe.com/ZzTenantOne/graphql'))).toBe('ZzTenantOne');
});

it('spells a PaaS URL one way: scheme, host case and a trailing slash do not matter', () => {
    const open = paas('open', 'https://Shop.Example.test/');
    const same = paas('same', 'http://shop.example.test');
    const other = paas('other', 'https://other.example.test');

    expect(onSameInstance(open, [same, other]).map((p) => p.name)).toEqual(['open', 'same']);
});

it('matches nothing to a project with no instance, but keeps the open project itself', () => {
    const open = createMockProject({ name: 'open', path: '/nonexistent/projects/open', componentConfigs: {} });
    const bare = createMockProject({ name: 'bare', path: '/nonexistent/projects/bare', componentConfigs: {} });

    expect(instanceKeyOf(open)).toBeUndefined();
    expect(onSameInstance(open, [bare]).map((p) => p.name)).toEqual(['open']);
});
