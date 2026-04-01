/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        glow: "0 0 0 1px rgba(99,102,241,0.2), 0 0 30px rgba(99,102,241,0.15)",
      },
      colors: {
        panel: "#111827",
        panelLight: "#1f2937",
      },
    },
  },
  plugins: [],
};
