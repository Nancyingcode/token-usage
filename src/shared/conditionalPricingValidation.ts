/**
 * @file 条件上下文与规则校验
 * @description 缓存和远程目录共用显式枚举与有限数值校验，拒绝执行表达式或嵌套请求树。
 */
import { isRecord } from './runtimeTypes';
import type { UsagePricingContext, PricingConditions } from './conditionalPricingTypes';

const MODES = new Set(['standard', 'fast', 'flex', 'batch']);
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const isUsagePricingContext = (raw: unknown): raw is UsagePricingContext =>
  isRecord(raw) &&
  (raw.granularity === 'request' || raw.granularity === 'aggregate') &&
  typeof raw.mode === 'string' &&
  (raw.mode === 'unknown' || MODES.has(raw.mode)) &&
  ['response', 'request', 'missing'].includes(String(raw.modeSource)) &&
  (raw.cacheWriteInputTokens === undefined || isNumber(raw.cacheWriteInputTokens)) &&
  (raw.cacheWriteInvalid === undefined || typeof raw.cacheWriteInvalid === 'boolean') &&
  (raw.cacheWriteSemantics === undefined ||
    ['included-in-input', 'unverified'].includes(String(raw.cacheWriteSemantics)));

export const hasValidPricingMetadata = (raw: Record<string, unknown>): boolean => {
  if (raw.pricingContext !== undefined && !isUsagePricingContext(raw.pricingContext)) {
    return false;
  }
  if (raw.pricingRequests === undefined) {
    return true;
  }
  return (
    isRecord(raw.pricingRequests) &&
    Object.values(raw.pricingRequests).every(
      (request) =>
        isRecord(request) &&
        request.pricingRequests === undefined &&
        [
          'inputTokens',
          'cachedInputTokens',
          'outputTokens',
          'reasoningOutputTokens',
          'totalTokens',
        ].every((key) => isNumber(request[key])) &&
        (request.pricingContext === undefined || isUsagePricingContext(request.pricingContext))
    )
  );
};

export const decodePricingConditions = (raw: unknown): PricingConditions => {
  if (
    !isRecord(raw) ||
    typeof raw.sourceUrl !== 'string' ||
    typeof raw.verifiedAt !== 'string' ||
    !Number.isFinite(Date.parse(raw.verifiedAt)) ||
    !isRecord(raw.modes) ||
    raw.modes.standard !== 1 ||
    !Object.entries(raw.modes).every(
      ([mode, rate]) => MODES.has(mode) && isNumber(rate) && rate > 0
    ) ||
    (raw.cacheWriteMultiplier !== undefined &&
      (!isNumber(raw.cacheWriteMultiplier) || raw.cacheWriteMultiplier <= 0))
  ) {
    throw new TypeError('Invalid pricing conditions.');
  }
  const url = new URL(raw.sourceUrl);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'developers.openai.com' ||
    url.username ||
    url.password ||
    url.port ||
    !url.pathname.startsWith('/api/docs/')
  ) {
    throw new TypeError('Invalid pricing conditions source.');
  }
  let longContext: PricingConditions['longContext'];
  if (raw.longContext !== undefined) {
    const value = raw.longContext;
    if (
      !isRecord(value) ||
      !isNumber(value.inputTokenThreshold) ||
      !Number.isInteger(value.inputTokenThreshold) ||
      !isNumber(value.inputMultiplier) ||
      value.inputMultiplier <= 0 ||
      !isNumber(value.cachedInputMultiplier) ||
      value.cachedInputMultiplier <= 0 ||
      !isNumber(value.cacheWriteMultiplier) ||
      value.cacheWriteMultiplier <= 0 ||
      !isNumber(value.outputMultiplier) ||
      value.outputMultiplier <= 0
    ) {
      throw new TypeError('Invalid context rate.');
    }
    longContext = {
      inputTokenThreshold: value.inputTokenThreshold,
      inputMultiplier: value.inputMultiplier,
      cachedInputMultiplier: value.cachedInputMultiplier,
      cacheWriteMultiplier: value.cacheWriteMultiplier,
      outputMultiplier: value.outputMultiplier,
    };
  }
  return {
    sourceUrl: raw.sourceUrl,
    verifiedAt: raw.verifiedAt,
    modes: { ...raw.modes, standard: 1 },
    ...(raw.cacheWriteMultiplier === undefined
      ? {}
      : { cacheWriteMultiplier: raw.cacheWriteMultiplier }),
    ...(longContext ? { longContext } : {}),
  };
};
