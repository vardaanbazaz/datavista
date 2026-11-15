import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { renderThemeCss } from "../themeCss";

it("themes.generated.css matches the registry (run `npm run theme:css`)", () => {
  const onDisk = readFileSync(resolve(__dirname, "../themes.generated.css"), "utf8");
  expect(onDisk).toBe(renderThemeCss());
});
