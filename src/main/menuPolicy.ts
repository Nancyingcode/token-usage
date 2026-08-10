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
