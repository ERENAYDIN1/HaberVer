import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

/** TypeScript'in kendisi zaten kullanilmayan degisken/import'lari yakaliyor
 *  (tsconfig: noUnusedLocals/noUnusedParameters). ESLint'in buradaki asil isi
 *  React kurallari - ozellikle hook bagimlilik dizileri (exhaustive-deps),
 *  cunku App/MapView'da elle yazilmis cok sayida useEffect var. */
export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Asagidakiler eklentinin 7. surumuyle gelen React COMPILER kurallari ve
      // varsayilan olarak "error". Proje React 18 + Compiler'siz oldugundan
      // bunlar hatali kodu degil, "derleyici bunu optimize edemezdi" durumunu
      // isaret ediyor (orn. objectURL uretip temizleyen dogru effect'ler).
      // Kalici kirmizi bir lint'e kimse bakmaz; gorunur kalsinlar diye warn.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  }
);
