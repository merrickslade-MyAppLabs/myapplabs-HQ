import { createContext, useContext, useEffect, useState } from 'react'

// Available themes — must match the [data-theme] selectors in themes.css
export const THEMES = {
  DARK:     'dark',
  LIGHT:    'light',
  CREAMY:   'creamy',
  MIDNIGHT: 'midnight',
  FOREST:   'forest',
  OCEAN:    'ocean',
  MOCHA:    'mocha',
  NEON:     'neon',
  ARCTIC:   'arctic',
  ROSE:     'rose'
}

export const THEME_LABELS = {
  dark:     'Dark',
  light:    'Light',
  creamy:   'Creamy',
  midnight: 'Midnight',
  forest:   'Forest',
  ocean:    'Ocean',
  mocha:    'Mocha',
  neon:     'Neon',
  arctic:   'Arctic',
  rose:     'Rose'
}

export const THEME_DESCRIPTIONS = {
  dark:     'Deep dark greys with purple accents',
  light:    'Clean white with subtle shadows',
  creamy:   'Warm creamy tones with amber accents',
  midnight: 'Deep navy blues with sky blue accents',
  forest:   'Dark woodland greens with emerald accents',
  ocean:    'Deep sea darks with cyan accents',
  mocha:    'Dark espresso browns with amber accents',
  neon:     'Pitch black with neon green accents',
  arctic:   'Cool icy whites with sky blue accents',
  rose:     'Soft pinks with rose red accents'
}

// Preview colours for the settings swatches
export const THEME_SWATCHES = {
  dark:     { bg: '#0f0f13', accent: '#6c63ff', text: '#f0f0f5' },
  light:    { bg: '#f5f5f7', accent: '#6c63ff', text: '#111118' },
  creamy:   { bg: '#f5efe6', accent: '#b5651d', text: '#2c1810' },
  midnight: { bg: '#090d18', accent: '#4f8ef7', text: '#e8eeff' },
  forest:   { bg: '#0b130c', accent: '#4caf6a', text: '#e4f0e4' },
  ocean:    { bg: '#070f16', accent: '#06b6d4', text: '#dff4f8' },
  mocha:    { bg: '#100c08', accent: '#d4863a', text: '#f5e8d8' },
  neon:     { bg: '#080808', accent: '#00ff88', text: '#e0ffe8' },
  arctic:   { bg: '#eaf2fb', accent: '#0ea5e9', text: '#0c1f3a' },
  rose:     { bg: '#fef2f6', accent: '#e11d6a', text: '#280a18' }
}

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(THEMES.DARK)
  const [themeLoading, setThemeLoading] = useState(true)

  // Load persisted theme from electron-store on mount
  useEffect(() => {
    async function loadTheme() {
      try {
        if (window.electronStore) {
          const saved = await window.electronStore.get('theme')
          if (saved && Object.values(THEMES).includes(saved)) {
            applyTheme(saved)
            setThemeState(saved)
          } else {
            applyTheme(THEMES.DARK)
          }
        }
      } catch (error) {
        console.warn('Could not load theme from store:', error)
        applyTheme(THEMES.DARK)
      } finally {
        setThemeLoading(false)
      }
    }

    loadTheme()
  }, [])

  /**
   * Apply theme by setting data-theme attribute on document.documentElement.
   * This triggers the CSS variable changes defined in themes.css.
   */
  function applyTheme(newTheme) {
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  /**
   * Set the theme, persist it, and apply CSS variables immediately.
   */
  async function setTheme(newTheme) {
    if (!Object.values(THEMES).includes(newTheme)) {
      console.warn(`Unknown theme: ${newTheme}`)
      return
    }

    applyTheme(newTheme)
    setThemeState(newTheme)

    try {
      if (window.electronStore) {
        await window.electronStore.set('theme', newTheme)
      }
    } catch (error) {
      console.warn('Could not persist theme:', error)
    }
  }

  const value = {
    theme,
    setTheme,
    themeLoading,
    THEMES,
    THEME_LABELS,
    THEME_DESCRIPTIONS,
    THEME_SWATCHES
  }

  return (
    <ThemeContext.Provider value={value}>
      {!themeLoading && children}
    </ThemeContext.Provider>
  )
}

// Custom hook
export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === null) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
