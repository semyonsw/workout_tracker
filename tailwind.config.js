/**
 * Tailwind / NativeWind configuration.
 *
 * The scale is deliberately amputated: no default colour palette, two radii,
 * five spacing steps, five type sizes. A design system you cannot deviate from
 * is what keeps a minimal app minimal six months in.
 *
 * Colour is near-black + one green scale. There is no second hue: no red for
 * destructive, no amber for warnings, no category chips. Green-on-black TEXT
 * is always `green-bright` (`green` fails contrast at small sizes); text on a
 * `green` fill is always `ink` at 600.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    // `colors` (not `extend.colors`) — the default Tailwind palette is removed
    // on purpose so `text-blue-500` simply doesn't exist.
    colors: {
      transparent: 'transparent',
      bg: 'rgb(var(--bg) / <alpha-value>)',
      surface: 'rgb(var(--surface) / <alpha-value>)',
      'surface-alt': 'rgb(var(--surface-alt) / <alpha-value>)',
      hairline: 'rgb(var(--hairline) / <alpha-value>)',
      ink: 'rgb(var(--ink) / <alpha-value>)',
      'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
      'ink-faint': 'rgb(var(--ink-faint) / <alpha-value>)',
      'green-wash': 'rgb(var(--green-wash) / <alpha-value>)',
      'green-dim': 'rgb(var(--green-dim) / <alpha-value>)',
      green: 'rgb(var(--green) / <alpha-value>)',
      'green-bright': 'rgb(var(--green-bright) / <alpha-value>)',
    },
    borderRadius: {
      none: '0',
      surface: '14px',
      pill: '9999px',
    },
    fontSize: {
      micro: ['11px', { lineHeight: '14px', letterSpacing: '1.1px' }],
      label: ['13px', { lineHeight: '18px' }],
      body: ['16px', { lineHeight: '22px' }],
      title: ['22px', { lineHeight: '28px', letterSpacing: '-0.4px' }],
      display: ['40px', { lineHeight: '44px', letterSpacing: '-1.2px' }],
    },
    spacing: {
      0: '0px',
      // A separator drawn as a View rather than a border needs a height, and
      // `h-hairline` should mean the same 1px everywhere `border-hairline` does.
      hairline: '1px',
      xs: '4px',
      sm: '8px',
      md: '12px',
      lg: '16px',
      xl: '24px',
      xxl: '40px',
      hit: '44px', // minimum tap target
      row: '56px', // set rows, list rows
      'row-lg': '64px', // editor / library rows (two lines of text)
      timer: '66px', // the content row of a floating timer pill — keep in sync with `size.timer`
      well: '96px', // numeric wells
    },
    extend: {
      borderWidth: {
        hairline: '1px',
      },
    },
  },
  plugins: [],
};
