/**
 * Which saves a save leaves behind (Phase 2, step-02 slice 4; D3; step-07 U1): a datapack keeps its
 * newest save, the one before it (the one Undo Last Save goes back to), and its first save, the
 * original Restore goes back to, for good. The saves between go, but never a named version (`main`),
 * and never a save a project uses or a project file shared.
 */

import { savesToTrim } from '@/features/data-installer/services/saveTrim';

const NONE: ReadonlySet<string> = new Set();

describe('savesToTrim', () => {
    it('keeps the newest two saves and the first, and names the ones between', () => {
        const versions = ['20261101-090000', '20261110-091500', '20261103-120000', '20261105-103000', '20261108-140200'];

        expect(savesToTrim(versions, NONE)).toEqual(['20261105-103000', '20261103-120000']);
    });

    it('never names a named version, however old', () => {
        expect(savesToTrim(['main', 'eds-compatible', '20261110-091500', '20261108-140200', '20261105-103000', '20261101-090000'], NONE)).toEqual(['20261105-103000']);
    });

    it('never names a save in use or shared in a project file', () => {
        const versions = ['20261110-091500', '20261108-140200', '20261105-103000', '20261103-120000', '20261101-090000'];

        expect(savesToTrim(versions, new Set(['20261105-103000']))).toEqual(['20261103-120000']);
    });

    it('names nothing with three saves or fewer', () => {
        expect(savesToTrim(['20261110-091500', '20261108-140200', '20261101-090000'], NONE)).toStrictEqual([]);
        expect(savesToTrim(['20261110-091500', '20261108-140200'], NONE)).toStrictEqual([]);
        expect(savesToTrim([], NONE)).toStrictEqual([]);
    });
});
