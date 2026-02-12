import { findComponentById } from '@/core/ui/utils/componentDataHelpers';

describe('findComponentById', () => {
    const data = {
        frontends: [{ id: 'fe-1', name: 'Frontend 1' }],
        backends: [{ id: 'be-1', name: 'Backend 1' }],
        dependencies: [{ id: 'dep-1', name: 'Dependency 1' }],
        mesh: [{ id: 'mesh-1', name: 'Mesh 1' }],
        integrations: [{ id: 'int-1', name: 'Integration 1' }],
        appBuilder: [{ id: 'app-1', name: 'App Builder 1' }],
    };

    it('should find component in frontends', () => {
        expect(findComponentById(data, 'fe-1')).toEqual({ id: 'fe-1', name: 'Frontend 1' });
    });

    it('should find component in backends', () => {
        expect(findComponentById(data, 'be-1')).toEqual({ id: 'be-1', name: 'Backend 1' });
    });

    it('should find component in dependencies', () => {
        expect(findComponentById(data, 'dep-1')).toEqual({ id: 'dep-1', name: 'Dependency 1' });
    });

    it('should find component in mesh', () => {
        expect(findComponentById(data, 'mesh-1')).toEqual({ id: 'mesh-1', name: 'Mesh 1' });
    });

    it('should find component in integrations', () => {
        expect(findComponentById(data, 'int-1')).toEqual({ id: 'int-1', name: 'Integration 1' });
    });

    it('should find component in appBuilder', () => {
        expect(findComponentById(data, 'app-1')).toEqual({ id: 'app-1', name: 'App Builder 1' });
    });

    it('should return undefined for unknown ID', () => {
        expect(findComponentById(data, 'unknown')).toBeUndefined();
    });

    it('should handle missing sections gracefully', () => {
        const sparse = { frontends: [{ id: 'fe-1', name: 'F' }] };
        expect(findComponentById(sparse, 'fe-1')).toEqual({ id: 'fe-1', name: 'F' });
        expect(findComponentById(sparse, 'be-1')).toBeUndefined();
    });

    it('should handle empty data object', () => {
        expect(findComponentById({}, 'any-id')).toBeUndefined();
    });

    it('should work with extra properties on the data object', () => {
        const dataWithExtras = {
            ...data,
            envVars: { some: 'value' },
            services: { svc: { name: 'Service' } },
        };
        expect(findComponentById(dataWithExtras, 'mesh-1')).toEqual({ id: 'mesh-1', name: 'Mesh 1' });
    });
});
