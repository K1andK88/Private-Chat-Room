import { useState, useRef, useEffect } from 'react'
import type { Theme } from '../lib/theme'
import { useTheme } from '../lib/theme'
import type { NotificationConfig } from '../hooks/useMessages'
import { BUILT_IN_SOUNDS, previewSound, stopCurrentSound, unlockAudio, saveCustomSound, loadCustomSound, removeCustomSound } from '../lib/sound'

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
  const [playingId, setPlayingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [hasCustom, setHasCustom] = useState(false)

  useEffect(() => {
    loadCustomSound().then(b => setHasCustom(!!b))
  }, [notifConfig.soundId])

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
    if (typeof Notification === 'undefined') return
    if (notifConfig.enabled) {
      onUpdateNotifConfig({ enabled: false })
    } else {
      if (Notification.permission === 'granted') {
        onUpdateNotifConfig({ enabled: true })
      } else if (Notification.permission === 'default') {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted') {
            onUpdateNotifConfig({ enabled: true })
          }
        })
      }
    }
  }

  const handleToggleSound = () => {
    onUpdateNotifConfig({ sound: !notifConfig.sound })
  }

  const handlePreview = async (id: string) => {
    // If currently playing this sound, stop it
    if (playingId === id) {
      stopCurrentSound()
      setPlayingId(null)
      return
    }
    setPreviewError(null)
    unlockAudio()
    setPlayingId(id)
    if (id === 'custom' && !hasCustom) {
      fileInputRef.current?.click()
      setPlayingId(null)
      return
    }
    const ok = await previewSound(id, notifConfig.volume, () => {
      setPlayingId(prev => prev === id ? null : prev)
    })
    if (!ok) {
      setPlayingId(null)
      setPreviewError('此格式无法播放，建议选择其他格式')
      setTimeout(() => setPreviewError(null), 3000)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Size warning (not blocking)
    if (file.size > 10 * 1024 * 1024) {
      // Still allow, just note it
      console.log('[sound] Large file selected:', (file.size / 1024 / 1024).toFixed(1), 'MB')
    }

    try {
      await saveCustomSound(file)
      setHasCustom(true)
      onUpdateNotifConfig({ soundId: 'custom' })
      // Auto-preview
      const ok = await previewSound('custom', notifConfig.volume)
      if (!ok) {
        setPreviewError('此格式无法播放，建议选择其他格式')
        setTimeout(() => setPreviewError(null), 3000)
      }
    } catch {
      setPreviewError('保存失败')
      setTimeout(() => setPreviewError(null), 3000)
    }
    // Reset input
    e.target.value = ''
  }

  const handleRemoveCustom = async () => {
    await removeCustomSound()
    setHasCustom(false)
    if (notifConfig.soundId === 'custom') {
      onUpdateNotifConfig({ soundId: 'system' })
    }
  }

  const permissionDenied = typeof Notification !== 'undefined' && notifConfig.enabled === false && Notification.permission === 'denied'
  const soundEnabled = notifConfig.enabled && notifConfig.sound

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
            <div className="absolute right-0 top-full mt-1 w-64 bg-surface-2 border border-bdr rounded-lg shadow-xl py-2 z-[60] max-h-[80vh] overflow-y-auto">
              <div className="px-3 pb-1.5 text-[10px] font-medium text-txt-3 uppercase tracking-wider">通知设置</div>

              {/* Enable notification */}
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

              {/* Enable sound */}
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

              {/* Sound selection + volume — only when both enabled */}
              {soundEnabled && (
                <>
                  <div className="border-t border-bdr my-1.5" />
                  <div className="px-3 pb-1 text-[10px] font-medium text-txt-3 uppercase tracking-wider">音效选择</div>
                  <div className="px-1">
                    {BUILT_IN_SOUNDS.map(opt => {
                      const isCustom = opt.custom
                      const showCustom = isCustom && hasCustom
                      const isSelected = notifConfig.soundId === opt.id
                      // Hide custom option if no custom sound set
                      if (isCustom && !hasCustom) {
                        return (
                          <button
                            key={opt.id}
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-surface-hover rounded text-sm text-txt-3 transition"
                          >
                            <span className="w-4 text-center">📁</span>
                            <span className="flex-1 text-left">上传自定义音效</span>
                          </button>
                        )
                      }
                      return (
                        <div key={opt.id} className={`flex items-center gap-2 px-2 py-1.5 rounded transition ${isSelected ? 'bg-accent-600/15 text-accent-500' : 'hover:bg-surface-hover text-txt-2'}`}>
                          <label className="flex items-center gap-2 flex-1 cursor-pointer">
                            <input
                              type="radio"
                              name="notif-sound"
                              checked={isSelected}
                              onChange={() => onUpdateNotifConfig({ soundId: opt.id })}
                              className="rounded"
                            />
                            <span className="text-sm">{opt.label}</span>
                          </label>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.preventDefault(); handlePreview(opt.id) }}
                              className={`text-[10px] px-1.5 py-0.5 rounded hover:bg-surface-hover transition ${playingId === opt.id ? 'text-accent-500' : 'text-txt-3 hover:text-txt'}`}
                              title={playingId === opt.id ? '停止' : '试听'}
                            >
                              {playingId === opt.id ? '■' : '▶'}
                            </button>
                            {showCustom && (
                              <button
                                onClick={(e) => { e.preventDefault(); handleRemoveCustom() }}
                                className="text-[10px] px-1.5 py-0.5 rounded hover:bg-surface-hover text-red-400 hover:text-red-300 transition"
                                title="删除"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Volume slider */}
                  <div className="px-3 pt-2 pb-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-medium text-txt-3 uppercase tracking-wider">音量</span>
                      <span className="text-[10px] text-txt-4">{Math.round(notifConfig.volume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(notifConfig.volume * 100)}
                      onChange={(e) => onUpdateNotifConfig({ volume: parseInt(e.target.value) / 100 })}
                      className="w-full h-1 bg-bdr rounded-lg appearance-none cursor-pointer accent-accent-500"
                    />
                  </div>
                </>
              )}

              {previewError && (
                <div className="px-3 py-1 text-[11px] text-red-400">
                  {previewError}
                </div>
              )}

              {/* Hidden file input for custom sound upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm,.opus,.amr"
                onChange={handleFileSelect}
                className="hidden"
              />
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
