import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decompressZstdFile } from '../src/main/zstdFrames';
import {
  compressZstd,
  rawZstdFrame,
  rleZstdFrame,
  skippableZstdFrame,
} from './nodeHelpers/zstdFixtures';

describe('strict Zstandard file decompression', () => {
  let directory = '';
  let source = '';
  let target = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'token-usage-zstd-'));
    source = join(directory, 'source.jsonl.zst');
    target = join(directory, 'target.jsonl');
  });

  afterEach(async () => {
    const child = relative(resolve(tmpdir()), resolve(directory));
    if (!child || child.startsWith('..') || isAbsolute(child)) {
      throw new Error('Refusing to remove a directory outside the test temporary root.');
    }
    await rm(directory, { recursive: true, force: true });
  });

  const decode = async (compressed: Buffer): Promise<Buffer> => {
    await writeFile(source, compressed);
    await decompressZstdFile(source, target);
    return readFile(target);
  };

  it('preserves the complete bytes, including invalid JSONL, and never modifies the source', async () => {
    const original = Buffer.from('{"message":"完整原文😀"}\r\n{broken\n');
    const compressed = compressZstd(original);
    await writeFile(source, compressed);
    const before = await stat(source);
    await decompressZstdFile(source, target);
    expect(await readFile(target)).toEqual(original);
    expect(await readFile(source)).toEqual(compressed);
    expect((await stat(source)).mtimeMs).toBe(before.mtimeMs);
  });

  it('decodes concatenated frames even when UTF-8 bytes and records cross frame boundaries', async () => {
    const original = Buffer.from('{"message":"中文😀"}\n');
    const compressed = Buffer.concat([
      compressZstd(original.subarray(0, 14)),
      compressZstd(original.subarray(14, 18)),
      compressZstd(original.subarray(18)),
    ]);
    expect(await decode(compressed)).toEqual(original);
  });

  it('skips complete metadata frames before, between, and after data frames', async () => {
    expect(
      await decode(
        Buffer.concat([
          skippableZstdFrame(),
          compressZstd('first'),
          skippableZstdFrame(),
          compressZstd('second'),
          skippableZstdFrame(),
        ])
      )
    ).toEqual(Buffer.from('firstsecond'));
  });

  it('handles raw blocks without declared content size', async () => {
    const content = Buffer.from('raw data');
    expect(await decode(rawZstdFrame(content))).toEqual(content);
  });

  it('handles RLE block payload length independently of its decoded length', async () => {
    expect(await decode(rleZstdFrame(600, 0x61))).toEqual(Buffer.alloc(600, 0x61));
  });

  it('handles the format offset of a two-byte declared content size', async () => {
    const original = Buffer.alloc(600, 0x61);
    const compressed = compressZstd(original);
    expect(compressed[4] >>> 6).toBe(1);
    expect(await decode(compressed)).toEqual(original);
  });

  it('handles an eight-byte declared content size', async () => {
    const content = Buffer.from('abc');
    const size = Buffer.alloc(8);
    size.writeBigUInt64LE(BigInt(content.length));
    const compressed = Buffer.concat([
      Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0xe0]),
      size,
      rawZstdFrame(content).subarray(6),
    ]);
    expect(await decode(compressed)).toEqual(content);
  });

  it('accepts a valid empty-content frame', async () => {
    expect(await decode(compressZstd(''))).toEqual(Buffer.alloc(0));
  });

  it('streams compressed data larger than the input read buffer', async () => {
    const original = randomBytes(300_000);
    expect(await decode(compressZstd(original))).toEqual(original);
  });

  it.each([1, 3, 5, 7, 10])('rejects incomplete frame bytes with truncation %i', async (cut) => {
    const compressed = compressZstd('a complete record\n');
    await writeFile(source, compressed.subarray(0, compressed.length - cut));
    await expect(decompressZstdFile(source, target)).rejects.toThrow();
  });

  it('rejects truncated skippable metadata', async () => {
    const compressed = skippableZstdFrame();
    await writeFile(source, compressed.subarray(0, compressed.length - 1));
    await expect(decompressZstdFile(source, target)).rejects.toThrow();
  });

  it.each([
    Buffer.from([0x28, 0xb5]),
    Buffer.from([0x28, 0xb5, 0x2f, 0xfd]),
    Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x08, 0]),
    Buffer.from([0x50, 0x2a, 0x4d, 0x18, 0]),
    Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x20, 0, 7, 0, 0]),
  ])('rejects malformed frame or block headers %#', async (compressed) => {
    await writeFile(source, compressed);
    await expect(decompressZstdFile(source, target)).rejects.toThrow();
  });

  it('rejects trailing bytes instead of silently accepting the first frame', async () => {
    await writeFile(source, Buffer.concat([compressZstd('record\n'), Buffer.from('garbage')]));
    await expect(decompressZstdFile(source, target)).rejects.toThrow();
  });

  it('rejects checksum corruption', async () => {
    const compressed = compressZstd('checksum-protected\n');
    compressed[compressed.length - 1] ^= 0xff;
    await writeFile(source, compressed);
    await expect(decompressZstdFile(source, target)).rejects.toThrow();
  });

  it('rejects content size mismatches', async () => {
    await writeFile(source, rawZstdFrame(Buffer.from('abc'), 4));
    await expect(decompressZstdFile(source, target)).rejects.toThrow();
  });

  it('rejects a frame that requires an external dictionary', async () => {
    const raw = rawZstdFrame(Buffer.from('abc'), 3);
    const dictionaryFrame = Buffer.concat([
      Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x21, 1, 3]),
      raw.subarray(6),
    ]);
    await writeFile(source, dictionaryFrame);
    await expect(decompressZstdFile(source, target)).rejects.toThrow();
  });

  it('rejects empty input', async () => {
    await writeFile(source, Buffer.alloc(0));
    await expect(decompressZstdFile(source, target)).rejects.toThrow();
  });

  it('never overwrites an existing target', async () => {
    await writeFile(source, compressZstd('new contents'));
    await writeFile(target, 'existing contents');
    await expect(decompressZstdFile(source, target)).rejects.toThrow();
    expect(await readFile(target, 'utf8')).toBe('existing contents');
  });

  it('refuses to use the source itself as the output', async () => {
    const compressed = compressZstd('protected source');
    await writeFile(source, compressed);
    await expect(decompressZstdFile(source, source)).rejects.toThrow();
    expect(await readFile(source)).toEqual(compressed);
  });
});
