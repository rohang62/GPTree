/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'chat-bg': 'var(--chat-bg)',
        'sidebar-bg': 'var(--sidebar-bg)',
        'message-user': 'var(--message-user)',
        'message-assistant': 'var(--message-assistant)',
      },
    },
  },
  plugins: [],
}

