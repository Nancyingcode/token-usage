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
