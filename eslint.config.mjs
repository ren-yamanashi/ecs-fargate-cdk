import antfu from "@antfu/eslint-config";

// https://github.com/antfu/eslint-config/tree/main
export default antfu({
  stylistic: {
    indent: 2,
    quotes: "double",
    semi: true,
  },
  typescript: true,
  rules: {
    "no-console": "warn",
    "no-new": "off",
    "node/prefer-global/process": "off",
    "curly": "off",
  },
});
