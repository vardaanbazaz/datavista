/**
 * Theme registry: the single source of every colour token (batch 7, "glass frame, solid data").
 *
 * Adding a theme = adding one entry to THEMES. From it:
 * - `scripts/theme/generate-theme-css.ts` writes src/shared/theme/themes.generated.css (one
 *   `:root[data-theme="id"]` block per theme plus its high-contrast block); a unit test fails
 *   when the checked-in CSS is out of date;
 * - `__tests__/tokens.contrast.test.ts` checks every text / control pair, including glass
 *   measured over the worst point of the ribbon and of whatever can scroll behind it;
 * - `__tests__/palette.cvd.test.ts` runs the colour-blind palette validator on `chart`;
 * - the Appearance panel draws the preview swatch from `ribbon`, `glass` and `primary`.
 *
 * No imports: the generator (Node), the tests and the inline boot script's build all load it.
 *
 * Surfaces:
 * - frame (`background`, ribbon, `glass` at `glassAlpha`): sidebar, page header, KPI tiles.
 *   Text on it: `foreground`, `frameMuted`.
 * - floating glass (`glass` at `floatAlpha`): sticky header, dialogs, popovers, menus. These sit
 *   over arbitrary content, so they are checked against text, chart marks and buttons too.
 * - data (`card`, drawn at SOLID_ALPHA with no blur): tables, summaries, chart plots.
 *   Text on it: `foreground`, `mutedForeground`.
 * Mid-tone themes keep the frame in the middle of the lightness range and put the data one
 * step lighter (Clay, Taupe) or darker (Dusk); `scheme` is the data surface's polarity.
 */

export type ThemeGroup = "default" | "light" | "neutral" | "dark";
export type Scheme = "light" | "dark";

export interface ThemeTokens {
  /** Page / frame base. */
  background: string;
  /** Primary text on every surface. */
  foreground: string;
  /** Secondary text on the frame (page background, ribbon, glass). */
  frameMuted: string;
  /** Glass tint. */
  glass: string;
  /** Glass opacity for frame tiles (sidebar, KPI tiles) and for floating glass (header, dialogs, menus). */
  glassAlpha: number;
  floatAlpha: number;
  /** Thin highlight edge on glass (decorative; controls carry their own ≥3:1 boundary). */
  glassBorder: string;
  /** Solid data surface (tables, summaries, chart plots). */
  card: string;
  /** Subtle fill on data surfaces (header rows, hover, chips). */
  muted: string;
  /** Secondary text on data surfaces. */
  mutedForeground: string;
  /** Accent: buttons, selection. */
  primary: string;
  primaryForeground: string;
  /** Accent as text / icon colour (links, active nav), readable on frame, glass and data. */
  primaryInk: string;
  /** Hover / selected fill on glass and data. */
  accent: string;
  /** Hairline dividers (decorative). */
  border: string;
  /** Boundary of interactive controls (inputs, outline buttons): ≥3:1 on every surface. */
  borderStrong: string;
  ring: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  warning: string;
  /** Categorical chart palette, fixed order, validated on `card`. */
  chart: [string, string, string, string, string];
  /** Aurora ribbon stops (left to right) and their peak opacity over `background`. */
  ribbon: [string, string, string, string];
  ribbonOpacity: number;
}

export interface ThemeDef {
  id: ThemeId;
  label: string;
  group: ThemeGroup;
  /** Polarity of the data surface: sets `.dark` and `color-scheme`. */
  scheme: Scheme;
  description: string;
  tokens: ThemeTokens;
}

export const THEME_IDS = ["light", "dark", "mist", "mint", "clay", "taupe", "dusk", "graphite", "midnight", "carbon"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Data surfaces are drawn at this opacity, with no backdrop blur. */
export const SOLID_ALPHA = 0.95;
/** Dialog overlay: black at this opacity, under dialogs. */
export const OVERLAY_ALPHA = 0.45;


export const THEMES: ThemeDef[] = [
  {
    id: "light",
    label: "Light",
    group: "default",
    scheme: "light",
    description: "Cool white, indigo accent",
    tokens: {
      background: "#F3F5F9",
      foreground: "#0E1526",
      frameMuted: "#3B4557",
      glass: "#FFFFFF",
      glassAlpha: 0.6,
      floatAlpha: 0.84,
      glassBorder: "#FFFFFF",
      card: "#FFFFFF",
      muted: "#EEF1F6",
      mutedForeground: "#4A5466",
      primary: "#4F46E5",
      primaryForeground: "#FFFFFF",
      primaryInk: "#4338CA",
      accent: "#E8EBF8",
      border: "#DCE1EA",
      borderStrong: "#6C7689",
      ring: "#4338CA",
      destructive: "#B21E33",
      destructiveForeground: "#FFFFFF",
      success: "#126640",
      warning: "#7F4E00",
      chart: ["#3376FB", "#E23915", "#219576", "#B847C7", "#B5750A"],
      ribbon: ["#8E7CF8", "#56A3F8", "#3CC8B4", "#FF9474"],
      ribbonOpacity: 0.62,
    },
  },
  {
    id: "dark",
    label: "Dark",
    group: "default",
    scheme: "dark",
    description: "Blue-black, periwinkle accent",
    tokens: {
      background: "#0C0F16",
      foreground: "#E9EDF4",
      frameMuted: "#BAC2CF",
      glass: "#1A1F2C",
      glassAlpha: 0.6,
      floatAlpha: 0.86,
      glassBorder: "#FFFFFF",
      card: "#131722",
      muted: "#1C2130",
      mutedForeground: "#A6AFBF",
      primary: "#8B8DFF",
      primaryForeground: "#0B0D17",
      primaryInk: "#A9ABFF",
      accent: "#252B3B",
      border: "#272D3B",
      borderStrong: "#7C86A0",
      ring: "#A9ABFF",
      destructive: "#F27A7A",
      destructiveForeground: "#160A0A",
      success: "#5FCB8F",
      warning: "#E8B04B",
      chart: ["#4684FC", "#F34F08", "#26A270", "#C851CD", "#9F8B07"],
      ribbon: ["#5B4BE0", "#2F7FE6", "#169E8E", "#D9605A"],
      ribbonOpacity: 0.52,
    },
  },
  {
    id: "mist",
    label: "Mist",
    group: "light",
    scheme: "light",
    description: "Cool blue-grey, steel blue accent",
    tokens: {
      background: "#E4EAF0",
      foreground: "#0F1A25",
      frameMuted: "#3B4959",
      glass: "#F6F9FC",
      glassAlpha: 0.58,
      floatAlpha: 0.86,
      glassBorder: "#FFFFFF",
      card: "#FBFCFE",
      muted: "#ECF0F5",
      mutedForeground: "#475665",
      primary: "#1F64A3",
      primaryForeground: "#FFFFFF",
      primaryInk: "#1B5A93",
      accent: "#E1E9F2",
      border: "#D3DCE6",
      borderStrong: "#627387",
      ring: "#1F64A3",
      destructive: "#B8283A",
      destructiveForeground: "#FFFFFF",
      success: "#136343",
      warning: "#7A4E00",
      chart: ["#2079FA", "#E74102", "#1E9577", "#BD44C0", "#B36E0D"],
      ribbon: ["#7FA6DA", "#9AA6E8", "#86CAD6", "#C3B6E2"],
      ribbonOpacity: 0.68,
    },
  },
  {
    id: "mint",
    label: "Mint",
    group: "light",
    scheme: "light",
    description: "Fresh green-grey, jade accent",
    tokens: {
      background: "#E5EFE9",
      foreground: "#0E1E17",
      frameMuted: "#385246",
      glass: "#F6FCF8",
      glassAlpha: 0.58,
      floatAlpha: 0.86,
      glassBorder: "#FFFFFF",
      card: "#FBFEFC",
      muted: "#E9F2EC",
      mutedForeground: "#41584D",
      primary: "#0D7356",
      primaryForeground: "#FFFFFF",
      primaryInk: "#0B6A4F",
      accent: "#DDEDE4",
      border: "#CFE0D6",
      borderStrong: "#5D776B",
      ring: "#0D7356",
      destructive: "#B8283A",
      destructiveForeground: "#FFFFFF",
      success: "#12623F",
      warning: "#7A4E00",
      chart: ["#077AFA", "#E2352E", "#15957B", "#B648CA", "#928700"],
      ribbon: ["#5FCDA8", "#5BB6D2", "#B3DC78", "#8EC4EE"],
      ribbonOpacity: 0.66,
    },
  },
  {
    id: "clay",
    label: "Clay",
    group: "neutral",
    scheme: "light",
    description: "Terracotta-grey frame, soft ivory data",
    tokens: {
      background: "#A78A7E",
      foreground: "#160F0C",
      frameMuted: "#291D18",
      glass: "#E6D6CC",
      glassAlpha: 0.5,
      floatAlpha: 0.9,
      glassBorder: "#F6EEE8",
      card: "#F8F2EA",
      muted: "#EFE5D9",
      mutedForeground: "#5A483D",
      primary: "#8A3A24",
      primaryForeground: "#FFFFFF",
      primaryInk: "#6E2A18",
      accent: "#EADCCF",
      border: "#DCCBBB",
      borderStrong: "#6E574A",
      ring: "#5E2617",
      destructive: "#811725",
      destructiveForeground: "#FFFFFF",
      success: "#144B30",
      warning: "#5C3C00",
      chart: ["#037FED", "#E23726", "#11957C", "#A91A92", "#B36E0D"],
      ribbon: ["#C46A4E", "#D99A6C", "#B5767F", "#9C93B5"],
      ribbonOpacity: 0.62,
    },
  },
  {
    id: "taupe",
    label: "Taupe",
    group: "neutral",
    scheme: "light",
    description: "Greige frame, linen data",
    tokens: {
      background: "#A29A8F",
      foreground: "#171512",
      frameMuted: "#2A2621",
      glass: "#E6E0D6",
      glassAlpha: 0.5,
      floatAlpha: 0.9,
      glassBorder: "#F4F0EA",
      card: "#F7F3EC",
      muted: "#EEE8DE",
      mutedForeground: "#544D44",
      primary: "#355A50",
      primaryForeground: "#FFFFFF",
      primaryInk: "#2F5148",
      accent: "#E7E1D6",
      border: "#D8D0C4",
      borderStrong: "#6A6257",
      ring: "#26413A",
      destructive: "#911C2A",
      destructiveForeground: "#FFFFFF",
      success: "#185638",
      warning: "#694400",
      chart: ["#0088E5", "#A82514", "#20984F", "#C93DAB", "#928700"],
      ribbon: ["#BBA488", "#8FA088", "#A8908E", "#C9B07A"],
      ribbonOpacity: 0.62,
    },
  },
  {
    id: "dusk",
    label: "Dusk",
    group: "neutral",
    scheme: "dark",
    description: "Mauve-brown frame, deep cocoa data",
    tokens: {
      background: "#5C4852",
      foreground: "#F8F1F3",
      frameMuted: "#F0E6EA",
      glass: "#3E2F37",
      glassAlpha: 0.5,
      floatAlpha: 0.9,
      glassBorder: "#C9B2BC",
      card: "#2A201E",
      muted: "#372B28",
      mutedForeground: "#CDBDB6",
      primary: "#E39A7E",
      primaryForeground: "#1E1210",
      primaryInk: "#F0B39C",
      accent: "#45363A",
      border: "#4C3D3C",
      borderStrong: "#B39DA2",
      ring: "#F0B39C",
      destructive: "#F8ADA6",
      destructiveForeground: "#1E0F0E",
      success: "#7FD0A0",
      warning: "#E9B961",
      chart: ["#3A86FB", "#EF4625", "#04996B", "#CE4DC4", "#9F8B07"],
      ribbon: ["#8E4E70", "#A8664E", "#64538E", "#9E7088"],
      ribbonOpacity: 0.58,
    },
  },
  {
    id: "graphite",
    label: "Graphite",
    group: "dark",
    scheme: "dark",
    description: "Neutral dark grey, teal accent",
    tokens: {
      background: "#151617",
      foreground: "#ECECEC",
      frameMuted: "#BFC1C4",
      glass: "#25272A",
      glassAlpha: 0.6,
      floatAlpha: 0.86,
      glassBorder: "#FFFFFF",
      card: "#1C1D1F",
      muted: "#26282B",
      mutedForeground: "#B3B5B9",
      primary: "#3CC2AE",
      primaryForeground: "#06120F",
      primaryInk: "#5AD0BE",
      accent: "#2C2F33",
      border: "#2E3034",
      borderStrong: "#80858C",
      ring: "#5AD0BE",
      destructive: "#F59090",
      destructiveForeground: "#160A0A",
      success: "#5FCB8F",
      warning: "#E8B04B",
      chart: ["#4684FC", "#F34F08", "#0BA378", "#C154D6", "#9F8B07"],
      ribbon: ["#59606E", "#7D8798", "#4F7480", "#857A90"],
      ribbonOpacity: 0.5,
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    group: "dark",
    scheme: "dark",
    description: "Deep navy, sky blue accent",
    tokens: {
      background: "#08122A",
      foreground: "#E6EDF8",
      frameMuted: "#CDD7E8",
      glass: "#13213F",
      glassAlpha: 0.6,
      floatAlpha: 0.86,
      glassBorder: "#BFD3FF",
      card: "#0D1A35",
      muted: "#16264A",
      mutedForeground: "#A3B4D0",
      primary: "#62A8FF",
      primaryForeground: "#04102A",
      primaryInk: "#86BCFF",
      accent: "#1B2C52",
      border: "#1F3157",
      borderStrong: "#7389B3",
      ring: "#86BCFF",
      destructive: "#F28B8B",
      destructiveForeground: "#1A0808",
      success: "#63CF97",
      warning: "#EBB552",
      chart: ["#1892DE", "#E4560F", "#0BA378", "#CD4EC6", "#988E11"],
      ribbon: ["#2050D6", "#6A4BD8", "#1696C2", "#3B6AE0"],
      ribbonOpacity: 0.62,
    },
  },
  {
    id: "carbon",
    label: "Carbon",
    group: "dark",
    scheme: "dark",
    description: "Near-black for OLED, amber accent",
    tokens: {
      background: "#000000",
      foreground: "#EDEDED",
      frameMuted: "#A6A6A6",
      glass: "#161616",
      glassAlpha: 0.6,
      floatAlpha: 0.88,
      glassBorder: "#FFFFFF",
      card: "#0B0B0C",
      muted: "#18181A",
      mutedForeground: "#A3A3A6",
      primary: "#F2A93B",
      primaryForeground: "#140C00",
      primaryInk: "#F5B95C",
      accent: "#202022",
      border: "#232326",
      borderStrong: "#7C7C83",
      ring: "#F5B95C",
      destructive: "#F27A7A",
      destructiveForeground: "#160A0A",
      success: "#5FCB8F",
      warning: "#E8B04B",
      chart: ["#128BF9", "#EE4812", "#13A377", "#C154D6", "#BA7C14"],
      ribbon: ["#4636A6", "#17698A", "#86365A", "#2B7856"],
      ribbonOpacity: 0.5,
    },
  },
];

export const THEME_BY_ID: Record<ThemeId, ThemeDef> = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<ThemeId, ThemeDef>;

export const isThemeId = (v: unknown): v is ThemeId => typeof v === "string" && (THEME_IDS as readonly string[]).includes(v);

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * High contrast strengthens any theme: opaque glass and data, control-strength borders
 * everywhere, secondary text at full strength, pure black or white text, no ribbon.
 */
export function highContrastTokens(t: ThemeTokens): ThemeTokens {
  const lightText = luminance(t.foreground) > 0.5;
  const ink = lightText ? "#FFFFFF" : "#000000";
  return {
    ...t,
    foreground: ink,
    frameMuted: ink,
    mutedForeground: ink,
    glassAlpha: 1,
    floatAlpha: 1,
    border: t.borderStrong,
    ribbonOpacity: 0,
  };
}
