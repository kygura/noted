import { useEffect } from 'react'

export function useHotkey(key: string, callback: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    function handler(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== key.toLowerCase()) return
      const active = document.activeElement
      const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      if (isInput) return
      e.preventDefault()
      callback()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [key, callback, enabled])
}
