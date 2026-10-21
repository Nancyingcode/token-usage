/**
 * @file 压缩会话本地存储路径边界
 * @description 将应用导入目录与只读来源隔离，并拒绝清单路径越界及目录链接跳转。
 */
import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isRecord } from '../shared/runtimeTypes';

const COMPRESSED_SUFFIX = '.zst';
const SESSION_SUFFIX = '.jsonl.zst';

export const isMissingPath = (error: unknown): boolean =>
  isRecord(error) && error.code === 'ENOENT';

export const isPathWithin = (parent: string, path: string): boolean => {
  const difference = relative(parent, path);
  return (
    difference === '' ||
    (!isAbsolute(difference) && difference !== '..' && !difference.startsWith(`..${sep}`))
  );
};

export const normalizeSourceRoot = (sessionsDir: string): string => {
  if (!isAbsolute(sessionsDir)) {
    throw new Error('Compressed source directory must be absolute.');
  }
  return resolve(sessionsDir);
};

export const getCompressedSourceKey = (sessionsDir: string, sourceFile: string): string => {
  if (
    !isAbsolute(sourceFile) ||
    !sourceFile.endsWith(SESSION_SUFFIX) ||
    !isPathWithin(sessionsDir, sourceFile)
  ) {
    throw new Error(
      'Compressed source is outside the selected source directory or has an invalid extension.'
    );
  }
  const key = relative(sessionsDir, sourceFile)
    .slice(0, -COMPRESSED_SUFFIX.length)
    .replace(/\\/g, '/');
  return process.platform === 'win32' ? key.toLowerCase() : key;
};

export const getCompressedRootDirectory = (storageDir: string, sessionsDir: string): string => {
  const identity = process.platform === 'win32' ? sessionsDir.toLowerCase() : sessionsDir;
  return join(storageDir, createHash('sha256').update(identity).digest('hex'));
};

const resolveExistingAncestor = async (path: string): Promise<string> => {
  try {
    return await realpath(path);
  } catch (error) {
    if (!isMissingPath(error)) {
      throw error;
    }
    const parent = dirname(path);
    if (parent === path) {
      throw error;
    }
    return resolve(await resolveExistingAncestor(parent), relative(parent, path));
  }
};

export const assertStorageSeparation = async (
  storageDir: string,
  sessionsDir: string
): Promise<void> => {
  const [actualStorage, actualSource] = await Promise.all([
    resolveExistingAncestor(storageDir),
    resolveExistingAncestor(sessionsDir),
  ]);
  if (isPathWithin(actualSource, actualStorage) || isPathWithin(actualStorage, actualSource)) {
    throw new Error('Compressed storage and the read-only source directory overlap.');
  }
};

export const assertManagedPath = async (storageDir: string, path: string): Promise<void> => {
  if (!isPathWithin(storageDir, path)) {
    throw new Error('Imported file path escapes the managed directory.');
  }
  const suffix = relative(storageDir, path);
  const segments = suffix ? suffix.split(sep) : [];
  let currentPath = storageDir;
  for (let index = 0; index <= segments.length; index += 1) {
    try {
      const entry = await lstat(currentPath);
      if (entry.isSymbolicLink()) {
        throw new Error('Imported storage must not contain symbolic links or junctions.');
      }
      if (index < segments.length && !entry.isDirectory()) {
        throw new Error('Imported storage parent must be a directory.');
      }
    } catch (error) {
      if (isMissingPath(error)) {
        return;
      }
      throw error;
    }
    if (index < segments.length) {
      currentPath = join(currentPath, segments[index]);
    }
  }
};

export const assertReadableCompressedSource = async (
  sessionsDir: string,
  sourceFile: string
): Promise<void> => {
  getCompressedSourceKey(sessionsDir, sourceFile);
  const [sourceInfo, actualRoot, actualSource] = await Promise.all([
    lstat(sourceFile),
    realpath(sessionsDir),
    realpath(sourceFile),
  ]);
  if (
    !sourceInfo.isFile() ||
    sourceInfo.isSymbolicLink() ||
    !isPathWithin(actualRoot, actualSource)
  ) {
    throw new Error('Compressed source is not a regular file within the selected directory.');
  }
};
