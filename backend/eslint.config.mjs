import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";

export default tseslint.config([
  globalIgnores(["dist"]),
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          // Express decides what a handler *is* from its arity: an error
          // handler must take exactly (err, req, res, next), and some route
          // handlers need a positional slot they never read. A leading
          // underscore is the explicit "required by the signature, not used"
          // marker for those cases.
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          // `const { secret, ...rest } = obj` is the idiomatic way to omit a
          // property; the binding is structurally required to do the omit.
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);
