/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        Jakarta: ["Jakarta", "sans-serif"],
        JakartaBold: ["Jakarta-Bold", "sans-serif"],
        JakartaExtraBold: ["Jakarta-ExtraBold", "sans-serif"],
        JakartaExtraLight: ["Jakarta-ExtraLight", "sans-serif"],
        JakartaLight: ["Jakarta-Light", "sans-serif"],
        JakartaMedium: ["Jakarta-Medium", "sans-serif"],
        JakartaSemiBold: ["Jakarta-SemiBold", "sans-serif"],
      },
      colors: {
        primary: { 100: "#F7F8FE", 200: "#EDF0FF", 300: "#D2D7FF", 400: "#A8B3F3", 500: "#5969C7", 600: "#4757B2", 700: "#303A7C", 800: "#252B5A", 900: "#20254C" },
        may: { page: "#F7F8FC", navy: "#303A7C", lavender: "#EDF0FF", purple: "#5969C7", ink: "#333B58" },
        secondary: { 100: "#F8F8F8", 200: "#F1F1F1", 300: "#D9D9D9", 400: "#C2C2C2", 500: "#AAAAAA", 600: "#999999", 700: "#666666", 800: "#4D4D4D", 900: "#333333" },
        success: { 100: "#F7F8FE", 200: "#EDF0FF", 300: "#D2D7FF", 400: "#A8B3F3", 500: "#4961AD", 600: "#4757B2", 700: "#303A7C", 800: "#252B5A", 900: "#20254C" },
        danger: { 100: "#FFF8F0", 200: "#FCEBD8", 300: "#F4D7B6", 400: "#D9A978", 500: "#B36A33", 600: "#9D562E", 700: "#8E4E2A", 800: "#784224", 900: "#66391F" },
        warning: { 100: "#FFFBEB", 200: "#FEF3C7", 300: "#FDE68A", 400: "#FACC15", 500: "#EAB308", 600: "#CA8A04", 700: "#A16207", 800: "#854D0E", 900: "#713F12" },
        general: { 100: "#CED1DD", 200: "#858585", 300: "#EEEEEE", 400: "#6979DC", 500: "#F6F8FA", 600: "#E6F3FF", 700: "#EBEBEB", 800: "#ADADAD" },
      },
    },
  },
  plugins: [],
};