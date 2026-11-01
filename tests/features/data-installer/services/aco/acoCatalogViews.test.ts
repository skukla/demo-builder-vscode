/**
 * Listing catalog views for a person to pick. The answer's shape is the admin API's, read from a real
 * instance on 2026-11-01.
 */

import { listAcoCatalogViews } from '@/features/data-installer/services/aco/acoCatalogViews';

const admin = (answer: unknown) => ({ graphql: jest.fn(async () => JSON.stringify(answer)) });

describe('listAcoCatalogViews', () => {
    it('gives each view its id, name and the locale it reads', async () => {
        const client = admin({
            data: { catalogViews: [{ viewId: 'v1', name: 'BuildRight-Default', sources: [{ locale: 'en-US' }] }] },
        });
        await expect(listAcoCatalogViews(client)).resolves.toEqual([{ id: 'v1', name: 'BuildRight-Default', locale: 'en-US' }]);
    });

    it('names a view by its id when it has no name, and leaves out a locale it does not state', async () => {
        await expect(listAcoCatalogViews(admin({ data: { catalogViews: [{ viewId: 'v1' }] } }))).resolves.toEqual([{ id: 'v1', name: 'v1' }]);
    });

    it("throws the API's words rather than answering an empty list", async () => {
        await expect(listAcoCatalogViews(admin({ errors: [{ message: 'not allowed' }] }))).rejects.toThrow('not allowed');
    });

    it('answers an empty list when the instance has no views', async () => {
        await expect(listAcoCatalogViews(admin({ data: { catalogViews: [] } }))).resolves.toStrictEqual([]);
    });
});
