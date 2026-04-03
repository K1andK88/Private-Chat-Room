import { useState, useRef, useEffect } from 'react'
import type { Theme } from '../lib/theme'
import { useTheme } from '../lib/theme'
import type { NotificationConfig } from '../hooks/useMessages'

interface HeaderProps {
  nickname: string
  onLeaveRoom?: () => void
  onLogout: () => void
  notifConfig: NotificationConfig
  onUpdateNotifConfig: (update: Partial<NotificationConfig>) => void
}

export default function Header({ nickname, onLeaveRoom, onLogout, notifConfig, onUpdateNotifConfig }: HeaderProps) {
  const { theme, setTheme } = useTheme()
  const [showSettings, setShowSettings] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  // Close settings dropdown on outside click
  useEffect(() => {
    if (!showSettings) return
    const handleClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showSettings])

  const cycleTheme = () => {
    const next: Theme[] = ['light', 'dark', 'system']
    const idx = next.indexOf(theme)
    const newTheme = next[(idx + 1) % next.length]
    const r = newTheme === 'light' ? 'light' : newTheme === 'dark' ? 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', r)
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

  const handleToggleNotif = () => {
    if (notifConfig.enabled) {
      // Turn off
      onUpdateNotifConfig({ enabled: false })
    } else {
      // Turn on — request permission if needed
      if (Notification.permission === 'granted') {
        onUpdateNotifConfig({ enabled: true })
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted') {
            onUpdateNotifConfig({ enabled: true })
          }
          // If denied, don't enable — user will see no change
        })
      }
      // If 'denied', do nothing — user needs to manually change in browser settings
    }
  }

  const handleToggleSound = () => {
    onUpdateNotifConfig({ sound: !notifConfig.sound })
  }

  const permissionDenied = notifConfig.enabled === false && Notification.permission === 'denied'

  return (
    <header className="h-14 bg-surface-2/80 backdrop-blur border-b border-bdr flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-lg">🔒</span>
        <span className="font-semibold text-txt text-sm">Private Chat</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative" ref={settingsRef}>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-txt-3 hover:text-txt text-xs px-2 py-1 rounded hover:bg-surface-hover transition flex items-center gap-1"
            title="通知设置"
          >
            <span>{notifConfig.enabled ? '🔔' : '🔕'}</span>
          </button>
          {showSettings && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-surface-2 border border-bdr rounded-lg shadow-xl py-2 z-50">
              <div className="px-3 pb-1.5 text-[10px] font-medium text-txt-3 uppercase tracking-wider">通知设置</div>

              <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-hover cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifConfig.enabled}
                  onChange={handleToggleNotif}
                  className="rounded"
                />
                <span className="text-sm text-txt-2">启用通知</span>
              </label>

              {permissionDenied && (
                <div className="px-3 py-1 text-[11px] text-yellow-500">
                  ⚠️ 浏览器已拒绝通知权限，请在浏览器设置中手动开启
                </div>
              )}

              <label className={`flex items-center gap-2 px-3 py-1.5 ${notifConfig.enabled ? 'hover:bg-surface-hover cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}>
                <input
                  type="checkbox"
                  checked={notifConfig.sound}
                  onChange={handleToggleSound}
                  disabled={!notifConfig.enabled}
                  className="rounded"
                />
                <span className="text-sm text-txt-2">提示音</span>
              </label>
            </div>
          )}
        </div>

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
