import { describe, expect, it } from "vitest";
import { cn } from "../utils";

describe("cn with the custom type scale", () => {
  it("keeps a custom size next to a colour", () => {
    expect(cn("text-h2", "text-destructive")).toBe("text-h2 text-destructive");
  });
  it("lets a later custom size replace a built-in one", () => {
    expect(cn("text-lg font-semibold", "text-h1")).toBe("font-semibold text-h1");
  });
});
