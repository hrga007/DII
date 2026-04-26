import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Mode    = 'light' | 'dark'
export type Palette = 'blue' | 'red' | 'yellow'

interface ThemeCtx {
  mode:         Mode
  palette:      Palette
  toggleMode:   () => void
  setPalette:   (p: Palette) => void
}

const Ctx = createContext<ThemeCtx>({
  mode: 'dark', palette: 'red',
  toggleMode: () => {}, setPalette: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(
    () => (localStorage.getItem('ui-mode') as Mode) ?? 'dark'
  )
  const [palette, setPaletteState] = useState<Palette>(
    () => (localStorage.getItem('ui-palette') as Palette) ?? 'red'
  )

  // Apply dark class to <html>
  useEffect(() => {
    const html = document.documentElement
    html.classList.toggle('dark', mode === 'dark')
    localStorage.setItem('ui-mode', mode)
  }, [mode])

  // Apply data-palette to <html>
  useEffect(() => {
    document.documentElement.dataset.palette = palette
    localStorage.setItem('ui-palette', palette)
  }, [palette])

  return (
    <Ctx.Provider value={{
      mode,
      palette,
      toggleMode: () => setMode(m => m === 'dark' ? 'light' : 'dark'),
      setPalette: (p) => setPaletteState(p),
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useTheme() { return useContext(Ctx) }
