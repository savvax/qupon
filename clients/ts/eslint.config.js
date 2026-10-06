import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "src/generated/", "src/dvp/generated/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
