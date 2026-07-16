# 移除 Airbnb ESLint 工具链实施计划

> **执行要求：** 按任务逐项执行；使用 `superpowers:executing-plans`，每一步完成后更新复选框状态。

**目标：** 删除 Airbnb ESLint 配置、兼容层和专属插件，同时保留 ESLint 10、TypeScript、React Hooks、React Refresh 与 Prettier 检查。

**架构：** 使用原生 ESLint Flat Config 组合 JavaScript recommended、TypeScript recommended 和项目规则，不再通过 FlatCompat 翻译经典配置。删除仅用于验证 Airbnb 规则族的测试，并通过 npm 更新直接依赖和锁文件。

**技术栈：** ESLint 10、TypeScript ESLint 8、React Hooks ESLint、React Refresh ESLint、Prettier 3、Vitest 2

## 全局约束

- 不修改应用运行时代码。
- 不回退此前为代码质量实施的业务代码重构。
- 不修改 lint、lint-staged、Prettier、Husky 或 commitlint 脚本。
- 不删除或修改历史 Airbnb 迁移文档和 `style-guide.md`。
- 保留 ESLint 10、TypeScript ESLint 8、React Hooks、React Refresh 和 `eslint-config-prettier`。
- 从直接依赖中删除七个已确认的 Airbnb 工具链包。

---

### 任务 1：卸载 Airbnb 专属依赖

**文件：**
- 修改：`package.json`
- 修改：`package-lock.json`

**输入：** 当前七个直接开发依赖。

**输出：** `package.json` 不再声明 Airbnb 配置、兼容层、Import/React/JSX-a11y 插件或 TypeScript import resolver。

- [x] **步骤 1：记录卸载前的直接依赖**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' ls @eslint/compat @eslint/eslintrc eslint-config-airbnb eslint-import-resolver-typescript eslint-plugin-import eslint-plugin-jsx-a11y eslint-plugin-react --depth=0
```

预期：七个包均作为当前项目的直接依赖列出。

- [x] **步骤 2：通过 npm 卸载七个直接依赖**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' uninstall --save-dev --legacy-peer-deps @eslint/compat @eslint/eslintrc eslint-config-airbnb eslint-import-resolver-typescript eslint-plugin-import eslint-plugin-jsx-a11y eslint-plugin-react
```

预期：`package.json` 和 `package-lock.json` 更新；不执行 `npm audit fix --force`。

- [x] **步骤 3：验证依赖边界**

```powershell
& 'C:\Program Files\nodejs\node.exe' -e "const p=require('./package.json'); const removed=['@eslint/compat','@eslint/eslintrc','eslint-config-airbnb','eslint-import-resolver-typescript','eslint-plugin-import','eslint-plugin-jsx-a11y','eslint-plugin-react']; const remaining=removed.filter((name)=>p.devDependencies?.[name]||p.dependencies?.[name]); if(remaining.length){throw new Error('Still direct: '+remaining.join(', '))}"
& 'C:\Program Files\nodejs\npm.cmd' ls eslint typescript-eslint eslint-config-prettier eslint-plugin-react-hooks eslint-plugin-react-refresh --depth=0
```

预期：第一条命令退出 0；第二条命令显示 ESLint 10、TypeScript ESLint 8 以及三个保留包。

---

### 任务 2：替换为原生精简 Flat Config

**文件：**
- 修改：`eslint.config.js`
- 删除：`tests/eslintConfig.test.ts`

**输入：** `@eslint/js`、`typescript-eslint`、React Hooks、React Refresh、globals 和 Prettier flat config。

**输出：** 无 FlatCompat、Airbnb、Import resolver、React style 或 JSX-a11y 配置的 ESLint 10 原生配置。

- [x] **步骤 1：删除 Airbnb 专属配置测试**

删除 `tests/eslintConfig.test.ts`。该测试的两个断言分别验证 Airbnb 规则族和 FlatCompat 解析覆盖，精简配置不再需要它们。

- [x] **步骤 2：替换 ESLint 配置**

将 `eslint.config.js` 替换为：

```js
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const TYPESCRIPT_FILES = ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', '*.config.ts'];
const NODE_FILES = [
  'src/main/**/*.ts',
  'src/preload/**/*.ts',
  'tests/**/*.{ts,tsx}',
  'scripts/**/*.cjs',
  '*.config.{js,cjs,mjs,ts}',
];
const COMMONJS_FILES = ['scripts/**/*.cjs', '*.config.cjs'];
const TYPESCRIPT_CONFIGS = tseslint.configs.recommended.map((config) => ({
  ...config,
  files: TYPESCRIPT_FILES,
}));

export default tseslint.config(
  {
    ignores: [
      '.husky/_/**',
      'coverage/**',
      'dist/**',
      'docs/**',
      'node_modules/**',
      'out/**',
      '*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  ...TYPESCRIPT_CONFIGS,
  {
    files: TYPESCRIPT_FILES,
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-var': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^React$',
        },
      ],
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: NODE_FILES,
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: COMMONJS_FILES,
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  prettierConfig
);
```

- [x] **步骤 3：验证配置不再包含 Airbnb 工具链**

```powershell
rg -n "airbnb|FlatCompat|fixupConfigRules|import/resolver|jsx-a11y|from 'eslint-plugin-react'" eslint.config.js package.json
```

预期：没有匹配结果。

- [x] **步骤 4：运行配置与代码门禁**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' exec eslint -- eslint.config.js src tests scripts --max-warnings=0
& 'C:\Program Files\nodejs\npm.cmd' exec prettier -- --check eslint.config.js package.json
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

预期：ESLint 零 warning、Prettier 通过、删除配置测试后的其余测试全部通过、两个 TypeScript 项目通过。

- [x] **步骤 5：提交工具链清理**

```powershell
git add eslint.config.js package.json package-lock.json tests/eslintConfig.test.ts
git commit -m "chore: remove airbnb eslint toolchain"
```

---

### 任务 3：完整验证与 Hook 模拟

**文件：**
- 修改：`docs/superpowers/plans/2026-07-16-remove-airbnb-eslint-toolchain.md`，仅更新复选框状态

- [x] **步骤 1：运行完整门禁**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run build
```

预期：测试、ESLint、Prettier、TypeScript 和 Electron 生产构建全部通过。

- [x] **步骤 2：暂存计划并模拟 pre-commit**

```powershell
git add docs/superpowers/plans/2026-07-16-remove-airbnb-eslint-toolchain.md
git status --short
& 'C:\Program Files\Git\bin\sh.exe' .husky/_/pre-commit
```

预期：只有中文计划文档处于暂存状态，当前 `npm run lint:staged` Hook 退出 0。

- [x] **步骤 3：在 Hook 后重复完整门禁**

重复任务 3 步骤 1 的四条命令。

预期：Hook 处理后所有命令仍退出 0。

- [x] **步骤 4：提交已验证计划**

```powershell
git diff --cached --check
git commit -m "docs: record airbnb eslint removal"
```

预期：commitlint 与 pre-commit 通过，提交不包含无关文件。
