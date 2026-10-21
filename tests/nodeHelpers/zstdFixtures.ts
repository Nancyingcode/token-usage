import { constants, zstdCompressSync } from 'node:zlib';

export const compressZstd = (content: Uint8Array | string): Buffer =>
  zstdCompressSync(content, { params: { [constants.ZSTD_c_checksumFlag]: 1 } });

export const skippableZstdFrame = (content = Buffer.from('metadata')): Buffer => {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(0x184d2a50);
  header.writeUInt32LE(content.length, 4);
  return Buffer.concat([header, content]);
};

export const rawZstdFrame = (content: Buffer, declaredSize?: number): Buffer => {
  const header = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0, 0]);
  if (declaredSize !== undefined) {
    header[4] = 0x20;
    header[5] = declaredSize;
  }
  const block = Buffer.alloc(3);
  block.writeUIntLE((content.length << 3) | 1, 0, 3);
  return Buffer.concat([header, block, content]);
};

export const rleZstdFrame = (length: number, value: number): Buffer => {
  const block = Buffer.alloc(3);
  block.writeUIntLE((length << 3) | 3, 0, 3);
  return Buffer.concat([Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0, 0]), block, Buffer.from([value])]);
};
