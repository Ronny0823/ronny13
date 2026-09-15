tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace'],
          },
          colors: {
            primary: {
              50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d',
              400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309',
              800: '#92400e', 900: '#78350f',
            },
            slate: { 850: '#151e2e', 900: '#0f172a', 950: '#020617' }
          },
          animation: {
            'fade-in': 'none',
            'slide-up': 'slideUp 0.4s ease-out',
            'slide-in-left': 'slideInLeft 0.3s ease-out',
            'slide-out-left': 'slideOutLeft 0.3s ease-in',
          },
          keyframes: {
            fadeIn: {
              '0%': { opacity: '0', transform: 'translateY(10px)' },
              '100%': { opacity: '1', transform: 'translateY(0)' },
            },
            slideInLeft: {
              '0%': { transform: 'translateX(-100%)' },
              '100%': { transform: 'translateX(0)' },
            },
            slideOutLeft: {
              '0%': { transform: 'translateX(0)' },
              '100%': { transform: 'translateX(-100%)' },
            }
          }
        }
      }
    }
  