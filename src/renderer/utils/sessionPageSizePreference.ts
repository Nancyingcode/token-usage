/**
 * @file 会话列表每页条数偏好
 * @description 校验并持久化仅属于 Renderer 的会话分页密度选择。
 */

export const SESSION_PAGE_SIZE_DEFAULT = 10;
export const SESSION_PAGE_SIZE_COMFORTABLE = 20;
export const SESSION_PAGE_SIZE_DENSE = 50;
export const SESSION_PAGE_SIZE_MAXIMUM = 100;

export const SESSION_PAGE_SIZE_OPTIONS = [
  SESSION_PAGE_SIZE_DEFAULT,
  SESSION_PAGE_SIZE_COMFORTABLE,
  SESSION_PAGE_SIZE_DENSE,
  SESSION_PAGE_SIZE_MAXIMUM,
] as const;

export type SessionPageSize = (typeof SESSION_PAGE_SIZE_OPTIONS)[number];

export const DEFAULT_SESSION_PAGE_SIZE: SessionPageSize = SESSION_PAGE_SIZE_DEFAULT;

const SESSION_PAGE_SIZE_STORAGE_KEY = 'codex-token-usage.sessions-page-size';

export interface SessionPageSizeStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export const isSessionPageSize = (value: number): value is SessionPageSize =>
  SESSION_PAGE_SIZE_OPTIONS.some((option) => option === value);

export const loadSessionPageSizePreference = (storage: SessionPageSizeStorage): SessionPageSize => {
  try {
    const storedValue = storage.getItem(SESSION_PAGE_SIZE_STORAGE_KEY);
    const parsedValue =
      storedValue === null || storedValue.trim() === '' ? NaN : Number(storedValue);

    return Number.isInteger(parsedValue) && isSessionPageSize(parsedValue)
      ? parsedValue
      : DEFAULT_SESSION_PAGE_SIZE;
  } catch {
    return DEFAULT_SESSION_PAGE_SIZE;
  }
};

export const saveSessionPageSizePreference = (
  pageSize: SessionPageSize,
  storage: SessionPageSizeStorage
): void => {
  try {
    storage.setItem(SESSION_PAGE_SIZE_STORAGE_KEY, String(pageSize));
  } catch {
    // 持久化不可用时，当前 Renderer 中的内存选择仍然有效。
  }
};
