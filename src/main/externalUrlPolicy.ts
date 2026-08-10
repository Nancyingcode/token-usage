/**
 * @file 外部链接安全策略
 * @description 仅允许应用打开经过协议和主机名白名单验证的 OpenAI 开发者链接。
 */
const ALLOWED_PROTOCOL = 'https:';
const ALLOWED_HOSTNAME = 'developers.openai.com';

export const isAllowedExternalUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === ALLOWED_PROTOCOL && url.hostname === ALLOWED_HOSTNAME;
  } catch {
    return false;
  }
};
