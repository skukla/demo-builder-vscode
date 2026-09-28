import { isBinary } from '@/features/eds/services/github/archiveFile';

/** The first bytes of a PNG: its signature carries a zero byte. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

describe('isBinary', () => {
    it('tells fonts and images from text', () => {
        expect(isBinary(PNG)).toBe(true);
        expect(isBinary(Buffer.from('export default 1; // ünïcødé', 'utf-8'))).toBe(false);
    });
});
