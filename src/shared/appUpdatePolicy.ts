/**
 * @file 稳定版升级规则
 * @description 与 NSIS 的三段稳定版本约束一致，不将预发布、未知版本或前导零当作可升级版本。
 */
const STABLE_VERSION_COMPONENT_COUNT = 3;

export type StableVersionRelation = 'newer' | 'same' | 'older' | 'invalid';

export const isStableAppVersion = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }
  const components = value.split('.');
  return (
    components.length === STABLE_VERSION_COMPONENT_COUNT &&
    components.every(
      (component) =>
        component.length > 0 &&
        !/[^0-9]/u.test(component) &&
        (component === '0' || !component.startsWith('0'))
    )
  );
};

export const compareStableAppVersions = (
  installed: string,
  candidate: string
): StableVersionRelation => {
  if (!isStableAppVersion(installed) || !isStableAppVersion(candidate)) {
    return 'invalid';
  }
  const installedComponents = installed.split('.');
  const candidateComponents = candidate.split('.');
  // 按十进制段长和字符比较，不转为 Number，避免大版本号舍入后误判为同版。
  for (const [index, installedComponent] of installedComponents.entries()) {
    const candidateComponent = candidateComponents[index];
    if (candidateComponent.length !== installedComponent.length) {
      return candidateComponent.length > installedComponent.length ? 'newer' : 'older';
    }
    if (candidateComponent !== installedComponent) {
      return candidateComponent > installedComponent ? 'newer' : 'older';
    }
  }
  return 'same';
};
