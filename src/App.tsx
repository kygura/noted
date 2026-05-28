import { Shell } from '@/components/Shell'
import { useTheme } from '@/hooks/useTheme'

export default function App() {
  const { theme, toggle } = useTheme()

  return <Shell theme={theme} onToggleTheme={toggle} />
}
