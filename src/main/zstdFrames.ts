/**
 * @file 严格 Zstandard 文件解压
 * @description 按容器边界逐帧异步解压到新的本地文件；源文件只读，不发布或覆盖已有副本。
 * @see https://github.com/facebook/zstd/blob/dev/doc/zstd_compression_format.md
 */
import { open, type FileHandle } from 'node:fs/promises';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createZstdDecompress } from 'node:zlib';

const ZSTD_MAGIC = 0xfd2fb528;
const SKIPPABLE_MAGIC_MIN = 0x184d2a50;
const SKIPPABLE_MAGIC_MAX = 0x184d2a5f;
const MAGIC_BYTES = 4;
const SKIPPABLE_SIZE_BYTES = 4;
const BLOCK_HEADER_BYTES = 3;
const CHECKSUM_BYTES = 4;
const READ_CHUNK_BYTES = 65_536;
const MAX_BLOCK_BYTES = 131_072;
const SINGLE_SEGMENT_MASK = 0x20;
const RESERVED_DESCRIPTOR_MASK = 0x08;
const CHECKSUM_MASK = 0x04;
const DICTIONARY_FLAG_MASK = 0x03;
const CONTENT_SIZE_FLAG_SHIFT = 6;
const BLOCK_TYPE_SHIFT = 1;
const BLOCK_TYPE_MASK = 0x03;
const BLOCK_SIZE_SHIFT = 3;
const RLE_BLOCK_TYPE = 1;
const RESERVED_BLOCK_TYPE = 3;
const TWO_BYTE_CONTENT_SIZE_OFFSET = 256;
const UINT64_BYTES = 8;
const UINT32_BYTES = 4;
const ZERO_BYTES = 0n;
const DICTIONARY_SIZE_BYTES = [0, 1, 2, UINT32_BYTES] as const;
const CONTENT_SIZE_BYTES = [0, 2, UINT32_BYTES, UINT64_BYTES] as const;

interface FrameReader {
  read: (length: number) => Promise<Buffer>;
  readMagic: () => Promise<Buffer | undefined>;
}

interface FrameHeader {
  bytes: Buffer;
  checksum: boolean;
  contentSize?: bigint;
}

const createFrameReader = (file: FileHandle): FrameReader => {
  const readExact = async (length: number, allowEnd = false): Promise<Buffer | undefined> => {
    const buffer = Buffer.allocUnsafe(length);
    let offset = 0;
    while (offset < length) {
      const { bytesRead } = await file.read(buffer, offset, length - offset, null);
      if (bytesRead === 0) {
        if (allowEnd && offset === 0) {
          return undefined;
        }
        throw new Error('Incomplete Zstandard frame.');
      }
      offset += bytesRead;
    }
    return buffer;
  };

  return {
    read: async (length) => {
      const buffer = await readExact(length);
      if (!buffer) {
        throw new Error('Incomplete Zstandard frame.');
      }
      return buffer;
    },
    readMagic: () => readExact(MAGIC_BYTES, true),
  };
};

const readFrameHeader = async (reader: FrameReader, magic: Buffer): Promise<FrameHeader> => {
  const descriptorBuffer = await reader.read(1);
  const descriptor = descriptorBuffer[0];
  if ((descriptor & RESERVED_DESCRIPTOR_MASK) !== 0) {
    throw new Error('Reserved Zstandard frame descriptor bit is set.');
  }

  const singleSegment = (descriptor & SINGLE_SEGMENT_MASK) !== 0;
  const window = singleSegment ? Buffer.alloc(0) : await reader.read(1);
  const dictionarySize = DICTIONARY_SIZE_BYTES[descriptor & DICTIONARY_FLAG_MASK];
  const dictionary = await reader.read(dictionarySize);
  if (dictionary.some((byte) => byte !== 0)) {
    throw new Error('External Zstandard dictionaries are not supported.');
  }

  const sizeFlag = descriptor >>> CONTENT_SIZE_FLAG_SHIFT;
  const sizeLength = sizeFlag === 0 && singleSegment ? 1 : CONTENT_SIZE_BYTES[sizeFlag];
  const sizeBytes = await reader.read(sizeLength);
  let contentSize: bigint | undefined;
  if (sizeLength > 0) {
    contentSize =
      sizeLength === UINT64_BYTES
        ? sizeBytes.readBigUInt64LE()
        : BigInt(sizeBytes.readUIntLE(0, sizeLength));
    if (sizeLength === 2) {
      contentSize += BigInt(TWO_BYTE_CONTENT_SIZE_OFFSET);
    }
  }

  return {
    bytes: Buffer.concat([magic, descriptorBuffer, window, dictionary, sizeBytes]),
    checksum: (descriptor & CHECKSUM_MASK) !== 0,
    contentSize,
  };
};

const writeAll = async (file: FileHandle, buffer: Buffer): Promise<void> => {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesWritten } = await file.write(buffer, offset, buffer.length - offset);
    if (bytesWritten === 0) {
      throw new Error('Unable to write the decompressed session file.');
    }
    offset += bytesWritten;
  }
};

const decompressFrame = async (
  reader: FrameReader,
  header: FrameHeader,
  target: FileHandle
): Promise<void> => {
  let inputBytes = header.bytes.length;
  let outputBytes = ZERO_BYTES;
  const chunks = async function* (): AsyncGenerator<Buffer> {
    yield header.bytes;
    let lastBlock = false;
    while (!lastBlock) {
      const blockHeader = await reader.read(BLOCK_HEADER_BYTES);
      const block = blockHeader.readUIntLE(0, BLOCK_HEADER_BYTES);
      lastBlock = (block & 1) !== 0;
      const type = (block >>> BLOCK_TYPE_SHIFT) & BLOCK_TYPE_MASK;
      const size = block >>> BLOCK_SIZE_SHIFT;
      if (type === RESERVED_BLOCK_TYPE || size > MAX_BLOCK_BYTES) {
        throw new Error('Invalid Zstandard block header.');
      }
      inputBytes += blockHeader.length;
      yield blockHeader;
      let remaining = type === RLE_BLOCK_TYPE ? 1 : size;
      while (remaining > 0) {
        const chunk = await reader.read(Math.min(remaining, READ_CHUNK_BYTES));
        remaining -= chunk.length;
        inputBytes += chunk.length;
        yield chunk;
      }
    }
    if (header.checksum) {
      const checksum = await reader.read(CHECKSUM_BYTES);
      inputBytes += checksum.length;
      yield checksum;
    }
  };

  // 当前 Electron 的原生解码器会接受截断输入或忽略同块中的后续帧。
  // 结构读取器必须完整消费一帧，并为每帧创建解码器；运行时修复且回归通过后才可简化。
  const decoder = createZstdDecompress();
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      outputBytes += BigInt(chunk.length);
      void writeAll(target, chunk).then(() => callback(), callback);
    },
  });
  await pipeline(Readable.from(chunks()), decoder, output);
  if (decoder.bytesWritten !== inputBytes) {
    throw new Error('The Zstandard frame was not fully consumed.');
  }
  if (header.contentSize !== undefined && header.contentSize !== outputBytes) {
    throw new Error('Zstandard frame content size does not match its header.');
  }
};

const skipFrame = async (reader: FrameReader): Promise<void> => {
  const size = await reader.read(SKIPPABLE_SIZE_BYTES);
  let remaining = size.readUInt32LE();
  while (remaining > 0) {
    const chunk = await reader.read(Math.min(remaining, READ_CHUNK_BYTES));
    remaining -= chunk.length;
  }
};

/**
 * 解压结果只有在 Promise 成功后才可生效。失败留下的独占目标由调用方的 staging 生命周期清理。
 */
export const decompressZstdFile = async (sourceFile: string, targetFile: string): Promise<void> => {
  const source = await open(sourceFile, 'r');
  let target: FileHandle | undefined;
  try {
    target = await open(targetFile, 'wx');
    const reader = createFrameReader(source);
    let hasFrame = false;
    let magicBuffer = await reader.readMagic();
    while (magicBuffer) {
      const magic = magicBuffer.readUInt32LE();
      if (magic === ZSTD_MAGIC) {
        const header = await readFrameHeader(reader, magicBuffer);
        await decompressFrame(reader, header, target);
      } else if (magic >= SKIPPABLE_MAGIC_MIN && magic <= SKIPPABLE_MAGIC_MAX) {
        await skipFrame(reader);
      } else {
        throw new Error('Invalid Zstandard frame magic or trailing data.');
      }
      hasFrame = true;
      magicBuffer = await reader.readMagic();
    }
    if (!hasFrame) {
      throw new Error('The compressed session file is empty.');
    }
    await target.sync();
  } finally {
    await Promise.all([source.close(), target?.close()]);
  }
};
