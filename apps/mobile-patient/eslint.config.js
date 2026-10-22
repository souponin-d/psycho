import parser from "@babel/eslint-parser";
import hooks from "eslint-plugin-react-hooks";
export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: { parserOpts: { plugins: ["typescript", "jsx"] } },
      },
    },
    plugins: { "react-hooks": hooks },
    rules: {
      ...hooks.configs.recommended.rules,
      "no-unreachable": "error",
      "no-duplicate-imports": "error",
      "no-debugger": "error",
      "no-var": "error",
      "prefer-const": "error",
    },
  },
];
