import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { useUiStore } from "@/store/uiStore";

/**
 * framer-motion follows Reading comfort's motion setting: "Match my device" is framer's own
 * "user" mode (prefers-reduced-motion), "Reduce" is "always", "Allow" is "never". CSS
 * animations follow the same choice through data-motion in index.css.
 */
export function MotionPreference({ children }: { children: ReactNode }) {
  const motion = useUiStore((s) => s.readingComfort.motion);
  const reducedMotion = motion === "reduce" ? "always" : motion === "full" ? "never" : "user";
  return <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>;
}
