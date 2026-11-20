/**
 * Whether a settings change moves a project that holds a datapack to another Commerce instance
 * (step-07 D6): the datapack would stay where it is, so both doors that change settings ask first.
 */

import { createMockProject } from '../../../helpers/projectFake';
import { datapackLeftByChange } from '@/features/dashboard/services/connectionChange';
import type { Project } from '@/types/base';

const ACCS = 'adobe-commerce-accs';
const PAAS = 'adobe-commerce-paas';
const endpoint = (tenant: string) => `https://na1-sandbox.api.commerce.adobe.com/${tenant}/graphql`;

const accsProject = (overrides: Partial<Project> = {}): Project =>
    createMockProject({
        datapack: { name: 'luma', version: 'main', store: 'library' },
        componentSelections: { backend: ACCS },
        componentConfigs: { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint('TenantA0123456789ABCD') } },
        ...overrides,
    });

describe('datapackLeftByChange', () => {
    it('names the datapack when the change points the project at another ACCS tenant', () => {
        const left = datapackLeftByChange(accsProject(), {
            [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint('TenantB0123456789ABCD') },
        });

        expect(left).toEqual({ name: 'luma', version: 'main', store: 'library' });
    });

    it('names it when the change clears the connection', () => {
        expect(
            datapackLeftByChange(accsProject(), { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: '' } })
        ).toBeDefined();
    });

    it('names it when a PaaS project moves to another Commerce URL', () => {
        const project = accsProject({
            componentSelections: { backend: PAAS },
            componentConfigs: { [PAAS]: { ADOBE_COMMERCE_URL: 'https://old.example.com' } },
        });

        expect(
            datapackLeftByChange(project, {
                [PAAS]: { ADOBE_COMMERCE_URL: 'https://new.example.com' },
            })
        ).toBeDefined();
    });

    it.each([
        ['a change that leaves the connection alone', { [ACCS]: { ACCS_WEBSITE_CODE: 'other' } }],
        [
            'the same tenant written again',
            { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint('TenantA0123456789ABCD') } },
        ],
    ])('names nothing for %s', (_label, changes) => {
        expect(datapackLeftByChange(accsProject(), changes)).toBeUndefined();
    });

    it('names nothing for a PaaS URL written over https and with its host in another case', () => {
        const project = accsProject({
            componentSelections: { backend: PAAS },
            componentConfigs: { [PAAS]: { ADOBE_COMMERCE_URL: 'http://shop.example.com' } },
        });

        expect(datapackLeftByChange(project, { [PAAS]: { ADOBE_COMMERCE_URL: 'https://Shop.Example.com/' } })).toBeUndefined();
    });

    it('names nothing when the project holds no datapack', () => {
        const project = accsProject({ datapack: undefined });

        expect(
            datapackLeftByChange(project, {
                [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint('TenantB0123456789ABCD') },
            })
        ).toBeUndefined();
    });

    it('names nothing when the project had no connection to leave it on', () => {
        const project = accsProject({ componentConfigs: {} });

        expect(
            datapackLeftByChange(project, {
                [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint('TenantB0123456789ABCD') },
            })
        ).toBeUndefined();
    });

    // D6 review S2: the record says where the datapack is, which after Change Anyway is not here.
    describe('with the install record noting an instance', () => {
        const A = 'TenantA0123456789ABCD';
        const B = 'TenantB0123456789ABCD';
        const onB = () => accsProject({ componentConfigs: { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint(B) } } });

        it('names nothing when the change points back at the instance the record names', () => {
            expect(datapackLeftByChange(onB(), { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint(A) } }, A)).toBeUndefined();
        });

        it('names nothing for any change while the datapack is already on another instance', () => {
            const toC = { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint('TenantC0123456789ABCD') } };

            expect(datapackLeftByChange(onB(), toC, A)).toBeUndefined();
        });

        it('CONTROL: names it when the record names this instance and the change moves away', () => {
            expect(datapackLeftByChange(onB(), { [ACCS]: { ACCS_GRAPHQL_ENDPOINT: endpoint(A) } }, B)).toBeDefined();
        });
    });
});
