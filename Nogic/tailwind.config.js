/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        elevated: "var(--bg-elevated)",
        muted: "var(--bg-muted)",
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        tertiary: "var(--text-tertiary)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        accent: "var(--accent)",
        "accent-subtle": "var(--accent-subtle)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        focus: "var(--focus)",
      },
      fontFamily: {
        sans: [
          '"Inter Variable"',
          "Inter",
          '"Noto Sans Arabic Variable"',
          "system-ui",
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono Variable"',
          '"JetBrains Mono"',
          '"Noto Sans Arabic Variable"',
          "ui-monospace",
          "monospace",
        ],
      },
      fontSize: {
        meta: ["12px", "1.5"],
        sec: ["13px", "1.6"],
        body: ["14px", "1.6"],
        title: ["16px", "1.3"],
        greet: ["20px", "1.3"],
      },
      borderRadius: {
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
        xl: "12px",
      },
      boxShadow: {
        quiet: "0 1px 2px rgba(0,0,0,0.04)",
      },
      maxWidth: {
        column: "720px",
      },
    },
  },
  plugins: [],
};
