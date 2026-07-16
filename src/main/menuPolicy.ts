export interface ApplicationMenuPolicy {
  autoHideMenuBar: boolean;
  removeApplicationMenu: boolean;
}

export function getApplicationMenuPolicy(isPackaged: boolean): ApplicationMenuPolicy {
  return {
    autoHideMenuBar: isPackaged,
    removeApplicationMenu: isPackaged,
  };
}
