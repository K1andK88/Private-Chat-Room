import { useState } from 'react'

interface NicknameEntryProps {
  onEnter: (nickname: string) => void
}

export default function NicknameEntry({ onEnter }: NicknameEntryProps) {
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = nickname.trim()
    if (!trimmed) {
      setError('请输入昵称')
      return
    }
    if (trimmed.length > 20) {
      setError('昵称最多 20 个字符')
      return
    }
    localStorage.setItem('pcr-nickname', trimmed)
    onEnter(trimmed)
  }

  const saved = localStorage.getItem('pcr-nickname')
  if (saved) {
    onEnter(saved)
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-txt">Private Chat Room</h1>
          <p className="text-txt-3 mt-2">端到端加密 · 无需注册 · 无痕聊天</p>
        </div>

        <div className="bg-surface-2 rounded-2xl p-8 border border-bdr">
          <h2 className="text-lg font-semibold text-txt mb-6">输入昵称</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value)
                  setError('')
                }}
                placeholder="你的昵称"
                className="w-full px-4 py-3 bg-surface-3 border border-bdr rounded-lg text-txt placeholder-txt-3 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
                autoFocus
                maxLength={20}
              />
            </div>
            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}
            <button
              type="submit"
              disabled={!nickname.trim()}
              className="w-full py-3 bg-accent-600 hover:bg-accent-700 disabled:bg-surface-3 disabled:text-txt-4 text-white font-medium rounded-lg transition"
            >
              进入聊天室
            </button>
          </form>
        </div>

        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-txt-4">
          <span>🔐 客户端加密</span>
          <span>·</span>
          <span>📡 实时通信</span>
          <span>·</span>
          <span>💨 自动消失</span>
        </div>
      </div>
    </div>
  )
}
