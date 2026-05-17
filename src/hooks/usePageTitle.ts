import { useEffect } from 'react'

const SUFFIX = ' — DII IT Ulaganja'

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title + SUFFIX
    return () => { document.title = 'DII IT Ulaganja' }
  }, [title])
}
