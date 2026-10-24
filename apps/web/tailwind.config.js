/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sanzo Wada Color System
        surface: {
          canvas: '#111317', // Deep warm obsidian
          panel: '#181b20',  // Pane container surface
          card: '#20242b',   // Field cards & timeline nodes
          border: '#2d333d', // Clean 1px industrial dividers
          hover: '#262c36',  // Interactive hover tone
        },
        accent: {
          coral: '#f27291',  // Sanzo Wada Primary (CTA, errors, active rings)
          teal: '#547076',   // Sanzo Wada Chrome (tags, coordinates, tabs)
          plum: '#7a4456',   // Sanzo Wada Depth (timeline markers, retry diffs)
        },
        status: {
          success: '#4ea685', // Muted sage green (avoids harsh neon)
          warning: '#e5a443', // Focused amber for retrying
          error: '#f27291',   // Maps to Coral Rose
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}