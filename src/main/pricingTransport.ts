/**
 * @file 价格目录下载
 * @description 请求固定公共目录，不携带会话内容或凭据；拒绝重定向并限制传输容量和时间。
 */
import {
  decodePricingCatalog,
  PRICING_CATALOG_URL,
  PRICING_MAX_BYTES,
  PRICING_REQUEST_TIMEOUT_MS,
} from '../shared/pricingCatalog';
import type { PricingCatalog } from '../shared/pricingCatalogTypes';

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
    const response = await fetcher(PRICING_CATALOG_URL, {
      signal: controller.signal,
      redirect: 'error',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok || !response.body) {
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
    return decodePricingCatalog(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
};
