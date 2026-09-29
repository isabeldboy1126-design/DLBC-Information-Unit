import { useState, useEffect, useCallback } from 'react'

const THEME_KEY = 'dlbc_theme'

export function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') return saved
    if (typeof document !== 'undefined') {
      const docTheme = document.documentElement.getAttribute('data-theme')
      if (docTheme === 'dark' || docTheme === 'light') return docTheme
    }
    return 'light'
  } catch (e) {
    return 'light'
  }
}

export function applyTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme)
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme)
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }
    window.dispatchEvent(new CustomEvent('dlbc-theme-change', { detail: theme }))
  } catch (e) {
    console.error('Failed to apply theme:', e)
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(() => getInitialTheme())

  useEffect(() => {
    const handleThemeChange = (e) => {
      if (e.detail && (e.detail === 'dark' || e.detail === 'light')) {
        setThemeState(e.detail)
      }
    }

    const handleStorage = (e) => {
      if (e.key === THEME_KEY && e.newValue) {
        setThemeState(e.newValue)
      }
    }

    window.addEventListener('dlbc-theme-change', handleThemeChange)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('dlbc-theme-change', handleThemeChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setThemeState(nextTheme)
    applyTheme(nextTheme)
  }, [theme])

  const setTheme = useCallback((newTheme) => {
    if (newTheme === 'dark' || newTheme === 'light') {
      setThemeState(newTheme)
      applyTheme(newTheme)
    }
  }, [])

  return { theme, toggleTheme, setTheme, isDark: theme === 'dark' }
}
