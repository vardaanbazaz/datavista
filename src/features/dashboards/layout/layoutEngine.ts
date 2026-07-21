import { DashboardLayoutItem } from "@/shared/types";

/**
 * Find a free spot in a 12-column grid for a new item of w: 4, h: 4
 */
export const findFreeSpot = (
  existingItems: DashboardLayoutItem[],
  newId: string,
  w = 4,
  h = 4
): DashboardLayoutItem => {
  let y = 0;
  while (true) {
    for (let x = 0; x <= 12 - w; x++) {
      const overlaps = existingItems.some((item) => {
        return !(
          x + w <= item.x ||
          x >= item.x + item.w ||
          y + h <= item.y ||
          y >= item.y + item.h
        );
      });
      if (!overlaps) {
        return { i: newId, x, y, w, h };
      }
    }
    y++;
  }
};

/**
 * Scales a 12-column layout to a 6-column layout for tablet (md).
 */
export const scaleToMd = (items: DashboardLayoutItem[]): DashboardLayoutItem[] => {
  return items.map((item) => {
    const w = Math.max(1, Math.round(item.w * 0.5));
    const x = Math.min(6 - w, Math.round(item.x * 0.5));
    return {
      i: item.i,
      x,
      y: item.y,
      w,
      h: item.h,
    };
  });
};

/**
 * Scales a 12-column layout to a 1-column layout for mobile (sm).
 * Stacks everything vertically.
 */
export const scaleToSm = (items: DashboardLayoutItem[]): DashboardLayoutItem[] => {
  // Sort items primarily by y, then by x to maintain natural reading order
  const sorted = [...items].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  let currentY = 0;
  return sorted.map((item) => {
    const mapped = {
      i: item.i,
      x: 0,
      y: currentY,
      w: 1,
      h: item.h,
    };
    currentY += item.h;
    return mapped;
  });
};

/**
 * Scales layout changes back to the 12-column space (lg) if modifications were made in md.
 */
export const scaleToLg = (
  items: { i: string; x: number; y: number; w: number; h: number }[],
  currentBreakpoint: string,
  previousLgLayout: DashboardLayoutItem[]
): DashboardLayoutItem[] => {
  if (currentBreakpoint === "lg") {
    return items.map((item) => ({
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    }));
  }

  if (currentBreakpoint === "md") {
    return items.map((item) => {
      const prev = previousLgLayout.find((p) => p.i === item.i);
      
      // If we have previous desktop coordinates, we try to preserve original alignment when possible
      // to avoid rounding-induced drifting.
      let w = item.w * 2;
      let x = item.x * 2;
      
      if (prev) {
        // If width in tablet matches scaled-down width, try to keep previous desktop width
        const expectedTabletW = Math.max(1, Math.round(prev.w * 0.5));
        if (expectedTabletW === item.w) {
          w = prev.w;
        }
        
        // If x in tablet matches scaled-down x, try to keep previous desktop x
        const expectedTabletX = Math.min(6 - expectedTabletW, Math.round(prev.x * 0.5));
        if (expectedTabletX === item.x) {
          x = prev.x;
        }
      }

      return {
        i: item.i,
        x: Math.min(12 - w, x),
        y: item.y,
        w: Math.min(12, w),
        h: item.h,
      };
    });
  }

  // sm / mobile changes are ignored (read-only)
  return previousLgLayout;
};
