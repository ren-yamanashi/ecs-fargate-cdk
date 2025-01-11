import eslint from "@eslint/js";
import eslintCdkPlugin from "eslint-cdk-plugin";
import importPlugin from "eslint-plugin-import";
import tsEslint from "typescript-eslint";

export default tsEslint.config(
  eslint.configs.recommended,
  ...tsEslint.configs.recommended,
  ...tsEslint.configs.stylistic,
  {
    files: ["src/**/*.ts", "aws/lib/**/*.ts", "aws/bin/*.ts"],
    languageOptions: {
      // ecmaVersion: 14,
      // sourceType: "commonjs",
      parserOptions: {
        projectService: true,
        project: "./tsconfig.json",
      },
    },
    plugins: {
      import: importPlugin,
      cdk: eslintCdkPlugin,
      typescript: tsEslint,
      eslint: eslint,
    },
    rules: {
      ...eslintCdkPlugin.configs.recommended.rules,
      /**
       * 無効にするルール
       */
      "@typescript-eslint/consistent-indexed-object-style": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "no-useless-constructor": "off",
      "@typescript-eslint/no-useless-constructor": "off",

      /**
       * 有効にするルール
       */
      "@typescript-eslint/explicit-module-boundary-types": "error",
      // NOTE: `@typescript-eslint/require-await`を有効にする場合、`require-await`は無効にする必要がある
      // https://typescript-eslint.io/rules/require-await/#how-to-use
      "require-await": "off",
      "@typescript-eslint/require-await": "error",
      // NOTE: `@typescript-eslint/no-empty-function`を有効にする場合、`no-empty-function`は無効にする必要がある
      // https://typescript-eslint.io/rules/no-empty-function/#how-to-use
      "no-empty-function": "off",
      "@typescript-eslint/no-empty-function": "warn",
      "import/order": [
        "warn",
        {
          alphabetize: { order: "asc" },
          "newlines-between": "always",
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  // NOTE: `ignores`に指定したパターンはESLintによってグローバルに無視される。
  //       参考: https://eslint.org/docs/latest/use/configure/configuration-files#globally-ignoring-files-with-ignores
  {
    ignores: ["dist", "aws/cdk.out", "node_modules", "*.js"],
  }
);