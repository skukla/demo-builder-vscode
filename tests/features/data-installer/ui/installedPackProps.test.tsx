/**
 * installedPackProps: what the flyout's main button is, by where it stands (Phase 5, J4-2; step-04
 * S5, decisions J8-1). Restore on the held version once Demo Builder installed it; Switch to over
 * the recorded datapack when another one is open; else Install (no extra props). The Switch rule is
 * the job window's own (`windowRoute`), so the button never says what the window will not do.
 */

import type { HeldFailure } from '@/features/data-installer/ui/hooks/useProjectHolding';
import { installedPackProps } from '@/features/data-installer/ui/installedPackProps';
import type { ProjectDatapack } from '@/types/datapack';

const HELD: ProjectDatapack = { name: 'my-luma', version: '20261112-120000', store: 'library' };
const AT = '2026-11-12T12:00:00.000Z';
const open = jest.fn();

describe('installedPackProps', () => {
    it('restores, with Uninstall, on the held version Demo Builder installed', () => {
        expect(installedPackProps({ library: false, held: HELD, installedAt: AT, selected: { name: HELD.name, version: HELD.version } }, open)).toEqual({
            onRemoveData: open,
            restores: true,
        });
    });

    it('switches on another datapack over the recorded one', () => {
        expect(installedPackProps({ library: false, held: HELD, installedAt: AT, selected: { name: 'bodea', version: 'main' } }, open)).toEqual({
            switches: true,
        });
    });

    it("CONTROL: another version of the held datapack is not a switch (the window says Install)", () => {
        expect(installedPackProps({ library: false, held: HELD, installedAt: AT, selected: { name: HELD.name, version: '20261101-090000' } }, open)).toStrictEqual({});
    });

    it('CONTROL: no switch when the held datapack has no install record, or in the Datapack Library', () => {
        const bodea = { name: 'bodea', version: 'main' };
        expect(installedPackProps({ library: false, held: HELD, installedAt: undefined, selected: bodea }, open)).toStrictEqual({});
        expect(installedPackProps({ library: true, held: HELD, installedAt: AT, selected: bodea }, open)).toStrictEqual({});
        expect(installedPackProps({ library: false, held: undefined, installedAt: undefined, selected: bodea }, open)).toStrictEqual({});
    });

    // Step-04 S8 (J6-2): a failed install of the held version offers Retry, not Restore; Uninstall
    // stays while Demo Builder recorded what that install put in.
    describe('a failed install of the held datapack', () => {
        const FAILED: HeldFailure = { reason: 'Products could not be installed.', retries: 0, commerceInstance: 'https://store.example.test' };
        const heldVersion = { name: HELD.name, version: HELD.version };

        it('is failed in place of Restore, with Uninstall while there is an install record', () => {
            expect(installedPackProps({ library: false, held: HELD, installedAt: AT, selected: heldVersion, failed: FAILED }, open)).toEqual({
                failed: FAILED,
                onRemoveData: open,
            });
        });

        it('is failed alone with no install record', () => {
            expect(installedPackProps({ library: false, held: HELD, installedAt: undefined, selected: heldVersion, failed: FAILED }, open)).toStrictEqual({
                failed: FAILED,
            });
        });

        it("CONTROL: another datapack's flyout is not failed", () => {
            expect(installedPackProps({ library: false, held: HELD, installedAt: AT, selected: { name: 'bodea', version: 'main' }, failed: FAILED }, open)).toEqual({
                switches: true,
            });
        });
    });
});
