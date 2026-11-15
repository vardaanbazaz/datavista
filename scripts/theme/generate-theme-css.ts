/**
 * Writes src/shared/theme/themes.generated.css from the theme registry.
 * Run with `npm run theme:css` after editing src/shared/theme/themes.ts.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderThemeCss } from "../../src/shared/theme/themeCss";

const out = resolve(__dirname, "../../src/shared/theme/themes.generated.css");
writeFileSync(out, renderThemeCss());
console.log(`wrote ${out}`);
