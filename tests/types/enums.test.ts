/**
 * Status Enums Tests
 *
 * Tests for MeshStatus and ComponentStatus enums ensuring correct values.
 */

import { MeshStatus, ComponentStatusEnum } from '@/types/enums';

describe('Status Enums', () => {
    describe('MeshStatus', () => {
        it('should have Deployed value equal to "deployed"', () => {
            expect(MeshStatus.Deployed).toBe('deployed');
        });

        it('should have NotDeployed value equal to "not_deployed"', () => {
            expect(MeshStatus.NotDeployed).toBe('not_deployed');
        });

        it('should have Stale value equal to "stale"', () => {
            expect(MeshStatus.Stale).toBe('stale');
        });

        it('should have Checking value equal to "checking"', () => {
            expect(MeshStatus.Checking).toBe('checking');
        });

        it('should have Error value equal to "error"', () => {
            expect(MeshStatus.Error).toBe('error');
        });

        it('should have exactly 5 values', () => {
            const values = Object.values(MeshStatus);
            expect(values).toHaveLength(5);
        });
    });

    describe('ComponentStatusEnum', () => {
        it('should have Installed value equal to "installed"', () => {
            expect(ComponentStatusEnum.Installed).toBe('installed');
        });

        it('should have NotInstalled value equal to "not_installed"', () => {
            expect(ComponentStatusEnum.NotInstalled).toBe('not_installed');
        });

        it('should have Updating value equal to "updating"', () => {
            expect(ComponentStatusEnum.Updating).toBe('updating');
        });

        it('should have Error value equal to "error"', () => {
            expect(ComponentStatusEnum.Error).toBe('error');
        });

        it('should have exactly 4 values', () => {
            const values = Object.values(ComponentStatusEnum);
            expect(values).toHaveLength(4);
        });
    });
});
