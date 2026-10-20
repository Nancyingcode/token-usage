/**
 * @file 价格目录下载
 * @description 请求固定公共目录，不携带会话内容或凭据；拒绝重定向并限制传输容量和时间。
 */
import {
  decodePricingCatalog,
  getPricingCatalogUrl,
  NULLABLE_PRICING_CATALOG_VERSION,
  PRICING_MAX_BYTES,
  PRICING_REQUEST_TIMEOUT_MS,
} from '../shared/pricingCatalog';
import type { PricingCatalog } from '../shared/pricingCatalogTypes';

const HTTP_NOT_FOUND = 404;
const CATALOG_VERSIONS = [NULLABLE_PRICING_CATALOG_VERSION, 2, 1] as const;

export const fetchPricingCatalog = async (
  signal: AbortSignal,
  fetcher: typeof fetch = fetch
): Promise<PricingCatalog> => {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) {
    controller.abort();
  }
  const timeout = setTimeout(abort, PRICING_REQUEST_TIMEOUT_MS);
  try {
    const options: RequestInit = {
      signal: controller.signal,
      redirect: 'error',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    };
    for (const version of CATALOG_VERSIONS) {
      const response = await fetcher(getPricingCatalogUrl(version), options);
      if (response.status === HTTP_NOT_FOUND) {
        await response.body?.cancel();
        continue;
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error('Pricing download failed.');
      }
      if (Number(response.headers.get('content-length')) > PRICING_MAX_BYTES) {
        await response.body.cancel();
        throw new TypeError('Pricing download exceeds size limit.');
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          size += value.byteLength;
          if (size > PRICING_MAX_BYTES) {
            throw new TypeError('Pricing download exceeds size limit.');
          }
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      return decodePricingCatalog(JSON.parse(Buffer.concat(chunks).toString('utf8')), version);
    }
    throw new Error('Pricing download failed.');
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
};
