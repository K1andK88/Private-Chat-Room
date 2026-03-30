import type { Theme } from '../lib/theme'
import { useTheme } from '../lib/theme'

interface HeaderProps {
  nickname: string
  onLeaveRoom?: () => void
  onLogout: () => void
}

export default function Header({ nickname, onLeaveRoom, onLogout }: HeaderProps) {
  const { theme, setTheme } = useTheme()

  const cycleTheme = () => {
    const next: Theme[] = ['light', 'dark', 'system']
    const idx = next.indexOf(theme)
    const newTheme = next[(idx + 1) % next.length]
    // Direct DOM manipulation as primary mechanism
    const r = newTheme === 'light' ? 'light' : newTheme === 'dark' ? 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', r)
    // Also update React state
    setTheme(newTheme)
  }

  const themeIcon = () => {
    if (theme === 'light') return '☀️'
    if (theme === 'dark') return '🌙'
    return '🖥️'
  }

  const themeLabel = () => {
    if (theme === 'light') return '浅色'
    if (theme === 'dark') return '深色'
    return '跟随系统'
  }

  return (
    <header className="h-14 bg-surface-2/80 backdrop-blur border-b border-bdr flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-lg">🔒</span>
        <span className="font-semibold text-txt text-sm">Private Chat</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={cycleTheme}
          className="text-txt-3 hover:text-txt text-xs px-2 py-1 rounded hover:bg-surface-hover transition flex items-center gap-1"
          title={`主题: ${themeLabel()}`}
        >
          <span>{themeIcon()}</span>
          <span className="hidden sm:inline">{themeLabel()}</span>
        </button>
        <span className="text-txt-3 text-xs hidden sm:block">{nickname}</span>
        {onLeaveRoom && (
          <button
            onClick={onLeaveRoom}
            className="text-txt-3 hover:text-yellow-400 text-xs px-2 py-1 rounded hover:bg-surface-hover transition"
          >
            退出房间
          </button>
        )}
        <button
          onClick={onLogout}
          className="text-txt-3 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-surface-hover transition"
        >
          退出登录
        </button>
      </div>
    </header>
  )
}
