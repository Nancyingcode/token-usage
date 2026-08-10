/**
 * @file 最新模型系列筛选
 * @description
 * 从合并价格表的规范模型 ID 中识别最高 gpt 主次版本，供成本优化限制替代候选。
 * 别名不参与版本竞争，历史实际成本仍由完整价格表负责。
 */
import type { ModelPricingEntry } from './budgetTypes';

const MODEL_SERIES_PATTERN = /^gpt-(\d+)\.(\d+)(?:-|$)/i;

interface ModelSeriesVersion {
  major: number;
  minor: number;
}

const parseModelSeriesVersion = (modelId: string): ModelSeriesVersion | undefined => {
  const match = modelId.trim().match(MODEL_SERIES_PATTERN);

  if (!match) {
    return undefined;
  }

  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);

  return Number.isSafeInteger(major) && Number.isSafeInteger(minor) ? { major, minor } : undefined;
};

const compareModelSeriesVersions = (
  first: ModelSeriesVersion,
  second: ModelSeriesVersion
): number => first.major - second.major || first.minor - second.minor;

/**
 * 返回价格表中最高 gpt 主次版本的全部条目，并保持原始价格表顺序。
 */
export const selectLatestModelSeriesPricing = (
  pricing: readonly ModelPricingEntry[]
): ModelPricingEntry[] => {
  const versionedEntries = pricing.flatMap((entry) => {
    const version = parseModelSeriesVersion(entry.modelId);
    return version ? [{ entry, version }] : [];
  });
  const latestVersion = versionedEntries.reduce<ModelSeriesVersion | undefined>(
    (latest, { version }) =>
      !latest || compareModelSeriesVersions(version, latest) > 0 ? version : latest,
    undefined
  );

  return latestVersion
    ? versionedEntries
        .filter(({ version }) => compareModelSeriesVersions(version, latestVersion) === 0)
        .map(({ entry }) => entry)
    : [];
};

/**
 * 返回最新模型系列的规范模型 ID。
 */
export const getLatestModelSeriesIds = (pricing: readonly ModelPricingEntry[]): string[] =>
  selectLatestModelSeriesPricing(pricing).map(({ modelId }) => modelId.trim());
