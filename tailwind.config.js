/** @type {import('tailwindcss').Config} */
export default {
    content: ["./src/**/*.{js,ts,jsx,tsx}"],
    prefix: "sr-",
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                background: "#0B0C0E",
                surface: "#141517",
                "surface-highlight": "#1E1F22",
                border: "rgba(255, 255, 255, 0.08)",
            },
            fontFamily: {
                sans: ["Inter", "system-ui", "sans-serif"],
            },
            boxShadow: {
                glow: "0 0 20px rgba(255, 255, 255, 0.05)",
                "glow-strong": "0 0 30px rgba(94, 110, 233, 0.15)",
            },
            backgroundImage: {
                "gradient-radial-top":
                    "radial-gradient(100% 60% at 50% 0%, var(--tw-gradient-stops))",
            },
        },
    },
    plugins: [],
    corePlugins: {
        preflight: false,
    },
};
