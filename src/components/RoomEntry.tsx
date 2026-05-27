import { useState } from 'react'

interface RoomEntryProps {
  onCreateRoom: (name: string, password: string) => void
  onJoinRoom: (name: string, password: string) => void
  loading: boolean
  error: string | null
  onClearError: () => void
}

function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export default function RoomEntry({ onCreateRoom, onJoinRoom, loading, error, onClearError }: RoomEntryProps) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose')
  const [roomName, setRoomName] = useState('')
  const [roomPassword, setRoomPassword] = useState('')

  const handleRandomId = () => {
    setRoomName(generateRoomId())
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomName.trim() || !roomPassword.trim()) return
    if (mode === 'create') {
      onCreateRoom(roomName.trim(), roomPassword.trim())
    } else {
      onJoinRoom(roomName.trim(), roomPassword.trim())
    }
  }

  const backToChoose = () => {
    setMode('choose')
    setRoomName('')
    setRoomPassword('')
    onClearError()
  }

  // Parse error message
  const roomError = error && /房间号|不存在/i.test(error)
  const passwordError = error && /密码|密钥|解密/i.test(error)

  if (mode === 'choose') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm space-y-3">
          <button
            onClick={() => { setMode('create'); onClearError() }}
            className="w-full p-4 bg-surface-2 hover:bg-surface-hover border border-bdr rounded-xl text-left transition group"
          >
            <div className="text-2xl mb-2">➕</div>
            <div className="text-txt font-medium group-hover:text-accent-400 transition">创建房间</div>
            <div className="text-txt-4 text-xs mt-1">生成随机房间号或自定义，邀请他人加入</div>
          </button>
          <button
            onClick={() => { setMode('join'); onClearError() }}
            className="w-full p-4 bg-surface-2 hover:bg-surface-hover border border-bdr rounded-xl text-left transition group"
          >
            <div className="text-2xl mb-2">🚪</div>
            <div className="text-txt font-medium group-hover:text-accent-400 transition">加入房间</div>
            <div className="text-txt-4 text-xs mt-1">输入房间号和密码，加入已有聊天室</div>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="bg-surface-2 rounded-2xl p-6 border border-bdr">
          <h3 className="text-txt font-semibold mb-4">
            {mode === 'create' ? '➕ 创建房间' : '🚪 加入房间'}
          </h3>

          {/* Error messages */}
          {(roomError || passwordError || error) && (
            <div className="mb-3 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs space-y-1">
              {roomError && (
                <p className="text-red-400">❌ {error}</p>
              )}
              {passwordError && (
                <p className="text-red-400">🔑 {error}</p>
              )}
              {!roomError && !passwordError && error && (
                <p className="text-red-400">⚠️ {error}</p>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-txt-3 mb-1 block">房间号</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className={`flex-1 px-4 py-2.5 bg-surface-3 border rounded-lg text-txt text-sm focus:outline-none focus:border-accent-500 font-mono tracking-wider text-center ${
                    roomError ? 'border-red-500' : 'border-bdr'
                  }`}
                  autoFocus
                  maxLength={32}
                />
                {mode === 'create' && (
                  <button
                    type="button"
                    onClick={handleRandomId}
                    className="px-3 py-2.5 bg-surface-3 hover:bg-surface-hover border border-bdr rounded-lg text-accent-400 text-sm shrink-0 transition"
                    title="随机生成房间号"
                  >
                    🎲
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-txt-3 mb-1 block">房间密码</label>
              <input
                type="password"
                value={roomPassword}
                onChange={(e) => setRoomPassword(e.target.value)}
                className={`w-full px-4 py-2.5 bg-surface-3 border rounded-lg text-txt text-sm focus:outline-none focus:border-accent-500 ${
                  passwordError ? 'border-red-500' : 'border-bdr'
                }`}
                maxLength={64}
                autoFocus={false}
              />
              <p className="text-[10px] text-txt-4 mt-1">
                🔑 相同房间号 + 相同密码 = 能互相解密消息
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={backToChoose}
                className="flex-1 py-2.5 text-txt-3 hover:text-txt border border-bdr rounded-lg text-sm transition"
              >
                返回
              </button>
              <button
                type="submit"
                disabled={loading || roomName.trim().length < 4 || !roomPassword.trim()}
                className="flex-1 py-2.5 bg-accent-600 hover:bg-accent-700 disabled:bg-surface-3 disabled:text-txt-4 text-white rounded-lg text-sm font-medium transition"
              >
                {loading ? '...' : mode === 'create' ? '创建' : '加入'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
