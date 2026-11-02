import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			fontFamily: {
				// Body and UI text: Source Serif 4 (a text serif built for small sizes). The key
				// stays `sans` so every existing component picks it up without a class change.
				sans: ['"Source Serif 4"', 'Georgia', 'Cambria', '"Times New Roman"', 'serif'],
				// Headings and the frame: Cormorant Garamond (display only, never below 18px).
				display: ['"Cormorant Garamond"', '"Source Serif 4"', 'Georgia', 'serif'],
				mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
			},
			fontSize: {
				// rem throughout, so Reading comfort's root size scales all of it. Display sizes
				// are a step larger than before: Cormorant has a small x-height.
				display: ['2.5rem', { lineHeight: '3rem', fontWeight: '600' }],
				h1: ['1.875rem', { lineHeight: '2.25rem', fontWeight: '600' }],
				h2: ['1.375rem', { lineHeight: '1.75rem', fontWeight: '600' }],
				h3: ['1.0625rem', { lineHeight: '1.5rem', fontWeight: '600' }],
				body: ['1rem', { lineHeight: '1.5rem', fontWeight: '400' }],
				caption: ['0.75rem', { lineHeight: '1rem', fontWeight: '600', letterSpacing: '0.12em' }],
				kpi: ['1.75rem', { lineHeight: '2rem', fontWeight: '700' }],
				dataTable: ['0.875rem', { lineHeight: '1.25rem', fontWeight: '500' }],
			},
			colors: {
				// Raw zinc/gray literals not yet moved to tokens (pages outside the batch 6 phase A
				// scope) are remapped to the warm ink / parchment neutrals so they don't sit cold
				// next to the new shell. Phase B replaces the literals with tokens.
				zinc: {
					50: '#FBF7EE',
					100: '#F2E9D8',
					200: '#E6DAC3',
					300: '#C4B49C',
					400: '#A8977F',
					500: '#7A6550',
					600: '#4A3D33',
					700: '#3E3229',
					800: '#2B231D',
					900: '#1E1814',
					950: '#15100C',
				},
				gray: {
					50: '#F7F1E5',
					100: '#EDE3D0',
					200: '#D9CBB0',
					300: '#C7B697',
					400: '#A8977F',
					500: '#7A6550',
					600: '#5F4B3B',
					700: '#4A3D33',
					800: '#2B231D',
					900: '#1E1814',
					950: '#15100C',
				},
				ornament: 'hsl(var(--ornament))',
				tertiary: {
					DEFAULT: 'hsl(var(--tertiary))',
					foreground: 'hsl(var(--tertiary-foreground))',
				},
				success: 'hsl(var(--success))',
				textTertiary: 'hsl(var(--text-tertiary))',
				borderStrong: 'hsl(var(--border-strong))',
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
					glow: 'hsl(var(--primary-glow))',
					// Oxblood for text and icons: Main itself is too dark on the dark surfaces.
					ink: 'hsl(var(--primary-ink))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				glass: 'hsl(var(--glass))',
				chart: {
					1: 'hsl(var(--chart-1))',
					2: 'hsl(var(--chart-2))',
					3: 'hsl(var(--chart-3))',
					4: 'hsl(var(--chart-4))',
					5: 'hsl(var(--chart-5))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'fade-in': {
					from: { opacity: '0', transform: 'translateY(10px)' },
					to: { opacity: '1', transform: 'translateY(0)' }
				},
				'slide-in-right': {
					from: { transform: 'translateX(100%)' },
					to: { transform: 'translateX(0)' }
				},
				'chart-animate': {
					from: { opacity: '0', transform: 'scale(0.95)' },
					to: { opacity: '1', transform: 'scale(1)' }
				},
				'pulse-glow': {
					'0%, 100%': { opacity: '1', filter: 'drop-shadow(0 0 15px rgba(212, 175, 55, 0.45))' },
					'50%': { opacity: '0.7', filter: 'drop-shadow(0 0 5px rgba(212, 175, 55, 0.2))' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'fade-in': 'fade-in 0.3s ease-out',
				'slide-in-right': 'slide-in-right 0.3s ease-out',
				'chart-animate': 'chart-animate 0.4s ease-out',
				'pulse-glow': 'pulse-glow 2s ease-in-out infinite'
			}
		}
	},
	plugins: [tailwindcssAnimate],
} satisfies Config;
