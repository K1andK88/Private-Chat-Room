import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeCtx {
  theme: Theme
  setTheme: (t: Theme) => void
  resolved: 'light' | 'dark'
}

const Ctx = createContext<ThemeCtx>({ theme: 'system', setTheme: () => {}, resolved: 'dark' })

function resolve(t: Theme): 'light' | 'dark' {
  if (t === 'light') return 'light'
  if (t === 'dark') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    (localStorage.getItem('pcr-theme') as Theme) || 'system'
  )

  const applyAndSet = useCallback((t: Theme) => {
    const r = resolve(t)
    document.documentElement.setAttribute('data-theme', r)
    localStorage.setItem('pcr-theme', t)
    setThemeState(t)
  }, [])

  // Apply on mount
  useEffect(() => {
    applyAndSet(theme)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for system theme changes when in system mode
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const r = resolve('system')
      document.documentElement.setAttribute('data-theme', r)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return (
    <Ctx.Provider value={{ theme, setTheme: applyAndSet, resolved: resolve(theme) }}>
      {children}
    </Ctx.Provider>
  )
}

export function useTheme() {
  return useContext(Ctx)
}
