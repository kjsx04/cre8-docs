import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // CRE8 Design System
        black: "#000000",
        white: "#FFFFFF",
        green: "#8CC644",
        charcoal: "#1A1A1A",
        "dark-gray": "#2A2A2A",
        "medium-gray": "#666666",
        "light-gray": "#F5F5F5",
        "border-gray": "#333333",
      },
      fontFamily: {
        bebas: ['"Bebas Neue"', "sans-serif"],
        dm: ['"DM Sans"', "sans-serif"],
      },
      borderRadius: {
        card: "8px",
        btn: "6px",
      },
    },
  },
  plugins: [],
};
export default config;
