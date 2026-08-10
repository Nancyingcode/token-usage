/**
 * @file 应用菜单策略
 * @description 根据开发或打包环境确定菜单栏和原生窗口边框行为。
 */
export interface ApplicationMenuPolicy {
  autoHideMenuBar: boolean;
  removeApplicationMenu: boolean;
  useNativeFrame: boolean;
}

export const getApplicationMenuPolicy = (isPackaged: boolean): ApplicationMenuPolicy => {
  return {
    autoHideMenuBar: isPackaged,
    removeApplicationMenu: isPackaged,
    useNativeFrame: !isPackaged,
  };
};
