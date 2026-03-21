/** @type {import('tailwindcss').Config} */
export default {
    content: ["./src/**/*.{js,ts,jsx,tsx}"],
    // 使用 prefix 避免与 Obsidian 内置样式冲突
    prefix: "sr-",
    darkMode: "class",
    theme: {
        extend: {
            // Linear 风格配色 (与 UIsandbox 保持一致)
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
    // 关键：确保 Tailwind 在 Obsidian 环境中正确工作
    corePlugins: {
        preflight: false, // 禁用 Tailwind 的全局重置，避免破坏 Obsidian 样式
    },
};
