import 'i18next';
import type { DEFAULT_NAMESPACE, I18N_RESOURCES } from './resources';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof DEFAULT_NAMESPACE;
    resources: (typeof I18N_RESOURCES)['en'];
    returnNull: false;
  }
}
