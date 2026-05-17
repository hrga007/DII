import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Mode = 'light' | 'dark'

interface ThemeCtx {
  mode:       Mode
  toggleMode: () => void
}

const Ctx = createContext<ThemeCtx>({
  mode: 'light',
  toggleMode: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(
    () => (localStorage.getItem('ui-mode') as Mode) ?? 'light'
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', mode === 'dark')
    localStorage.setItem('ui-mode', mode)
  }, [mode])

  return (
    <Ctx.Provider value={{
      mode,
      toggleMode: () => setMode(m => m === 'dark' ? 'light' : 'dark'),
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useTheme() { return useContext(Ctx) }
