import { createContext, useContext, useEffect, useState } from 'react'

// Available themes — must match the [data-theme] selectors in themes.css
export const THEMES = {
  DARK: 'dark',
  LIGHT: 'light',
  CREAMY: 'creamy'
}

export const THEME_LABELS = {
  dark: 'Dark Mode',
  light: 'Light Mode',
  creamy: 'Creamy Brown'
}

export const THEME_DESCRIPTIONS = {
  dark: 'Deep dark greys with purple accents',
  light: 'Clean white with subtle shadows',
  creamy: 'Warm creamy tones with amber accents'
}

// Preview colours for the settings swatches
export const THEME_SWATCHES = {
  dark: { bg: '#0f0f13', accent: '#6c63ff', text: '#f0f0f5' },
  light: { bg: '#f5f5f7', accent: '#6c63ff', text: '#111118' },
  creamy: { bg: '#f5efe6', accent: '#b5651d', text: '#2c1810' }
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
