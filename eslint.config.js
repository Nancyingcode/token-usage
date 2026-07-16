import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "docs/**",
      "node_modules/**",
      "out/**",
      "*.config.js",
      "*.config.cjs",
      "*.config.mjs",
      "*.tsbuildinfo"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^React$"
        }
      ],
      "react-hooks/set-state-in-effect": "off",
      "react-refresh/only-export-components": "off",
      "no-var": "error"
    }
  },
  {
    files: ["scripts/**/*.cjs"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  },
  {
    files: ["src/main/**/*.ts", "src/preload/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  }
);
