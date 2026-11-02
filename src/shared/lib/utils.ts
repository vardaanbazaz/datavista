import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/*
 * tailwind-merge must know the custom type scale in tailwind.config.ts (text-display,
 * text-h1 …). Without this it reads `text-h2` as a text colour: `cn("text-h2",
 * "text-destructive")` dropped the size, and `cn("text-lg", "text-h1")` kept both sizes.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "h1", "h2", "h3", "body", "caption", "kpi", "dataTable"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
