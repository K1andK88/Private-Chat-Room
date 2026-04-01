import { useState, useEffect, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { ThemeProvider } from './lib/theme'
import { deriveKey, decryptMessage, encryptMessage } from './lib/crypto'
import { useRoom } from './hooks/useRoom'
import { useMessages } from './hooks/useMessages'
import NicknameEntry from './components/Login'
import Header from './components/Header'
import RoomEntry from './components/RoomEntry'
import MessageList from './components/MessageList'
import MessageInput from './components/MessageInput'
import MemberList from './components/MemberList'

function ChatApp() {
  const [accessGranted, setAccessGranted] = useState(() => {
    const gatePassword = import.meta.env.VITE_ACCESS_PASSWORD
    if (!gatePassword) return true
    return localStorage.getItem('pcr-access') === gatePassword
  })
  const [gateInput, setGateInput] = useState('')
  const [gateError, setGateError] = useState(false)

  const [nickname, setNickname] = useState<string | null>(() => {
    const gatePassword = import.meta.env.VITE_ACCESS_PASSWORD
    const gatePassed = !gatePassword || localStorage.getItem('pcr-access') === gatePassword
    if (gatePassed) {
      return localStorage.getItem('pcr-nickname')
    }
    return null
  })
  const [roomPassword, setRoomPassword] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [showMembers, setShowMembers] = useState(false)

  const { currentRoom, onlineUsers, loading, createRoom, joinRoom, leaveRoom } = useRoom(nickname ?? '')

  const {
    messages,
    error: msgError,
    sendMessage,
    sendImage,
    retryMessage,
    revokeMessage,
    getDecrypted,
    getFileMeta,
    loadOriginalImage,
    replyTo,
    setReplyTo,
    encryptionKey,
    setError: _setMsgError,
    sendingImage,
    imagePreview,
    clearImagePreview,
    selectImage,
  } = useMessages(currentRoom?.id ?? null, roomPassword, nickname ?? '')

  // ── ALL hooks must be declared BEFORE any conditional return ──

  const joinOrCreateRoom = useCallback(async (name: string, password: string) => {
    setJoinError(null)
    setRoomPassword(password)

    const { data: existing, error: dbError } = await supabase
      .from('rooms')
      .select('*')
      .eq('name', name)
      .single()

    if (dbError && dbError.code === 'PGRST116') {
      const room = await createRoom(name)
      if (room) {
        await joinRoom(room)
      } else {
        setJoinError('创建房间失败，请稍后重试')
      }
      return
    }

    if (!existing) {
      setJoinError('房间号不存在，请检查后重试')
      return
    }

    // Verify password via password_verify field
    try {
      const key = await deriveKey(password, existing.id)
      if (!existing.password_verify) {
        setRoomPassword('')
        setJoinError('⚠️ 该房间版本过旧，无法验证密码')
        return
      }
      const payload = existing.password_verify as { ciphertext: string; iv: string }
      const decrypted = await decryptMessage(payload, key)
      if (decrypted !== (import.meta.env.VITE_VERIFY_SECRET || 'PCR_VERIFY_2026')) {
        throw new Error('password mismatch')
      }
    } catch {
      setRoomPassword('')
      setJoinError('🔑 密码不正确')
      return
    }

    await joinRoom(existing)
  }, [joinRoom, createRoom])

  useEffect(() => {
    if (!nickname || currentRoom) return
    const params = new URLSearchParams(window.location.search)
    const room = params.get('r')
    const password = params.get('p')
    if (!room || !password) return
    window.history.replaceState({}, '', window.location.pathname)
    joinOrCreateRoom(room, password)
  }, [nickname, currentRoom, joinOrCreateRoom])

  useEffect(() => {
    if (currentRoom) setJoinError(null)
  }, [currentRoom])

  // ── Event handlers (not hooks, but keep before returns for clarity) ──

  const handleGateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const gatePassword = import.meta.env.VITE_ACCESS_PASSWORD || ''
    if (gateInput === gatePassword) {
      localStorage.setItem('pcr-access', gatePassword)
      setAccessGranted(true)
      const savedNick = localStorage.getItem('pcr-nickname')
      if (savedNick) setNickname(savedNick)
    } else {
      setGateError(true)
      setGateInput('')
    }
  }

  const handleCreateRoom = async (name: string, password: string) => {
    setJoinError(null)
    try {
      const room = await createRoom(name)
      if (room) {
        // Derive key with actual room ID, store password verification
        const key = await deriveKey(password, room.id)
        const verifyPayload = await encryptMessage(import.meta.env.VITE_VERIFY_SECRET || 'PCR_VERIFY_2026', key)
        await supabase.from('rooms').update({ password_verify: verifyPayload }).eq('id', room.id)

        setRoomPassword(password)
        await joinRoom(room)
      } else {
        setJoinError('创建房间失败，请稍后重试')
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'ROOM_EXISTS') {
        setJoinError('房间号已存在，请换一个或直接加入')
      } else {
        setJoinError('创建房间失败，请稍后重试')
      }
    }
  }

  const handleJoinRoom = async (name: string, password: string) => {
    setJoinError(null)
    await joinOrCreateRoom(name, password)
  }

  const clearJoinError = useCallback(() => setJoinError(null), [])

  const handleLeaveRoom = async () => {
    await leaveRoom()
    setRoomPassword('')
    setJoinError(null)
  }

  const handleLogout = () => {
    leaveRoom()
    setRoomPassword('')
    setJoinError(null)
    localStorage.removeItem('pcr-nickname')
    setNickname(null)
  }

  // ── Conditional returns (AFTER all hooks) ──

  if (!accessGranted) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <form onSubmit={handleGateSubmit} className="flex flex-col items-center gap-4">
          <div className="text-4xl mb-2">🔒</div>
          <h1 className="text-xl font-medium text-txt">访问验证</h1>
          <input
            type="password"
            value={gateInput}
            onChange={(e) => { setGateInput(e.target.value); setGateError(false) }}
            placeholder="请输入访问密码"
            autoFocus
            className={`w-64 px-4 py-2.5 rounded-xl border text-[15px] bg-surface-2 text-txt outline-none transition ${gateError ? 'border-red-400' : 'border-bdr focus:border-accent-400'}`}
          />
          {gateError && <p className="text-red-400 text-sm">密码错误</p>}
          <button
            type="submit"
            className="w-64 py-2.5 rounded-xl bg-accent-600 hover:bg-accent-500 text-white font-medium transition"
          >
            进入
          </button>
        </form>
      </div>
    )
  }

  if (!nickname) {
    return <NicknameEntry onEnter={(n) => setNickname(n)} />
  }

  return (
    <div className="h-screen flex flex-col bg-surface">
      <Header
        nickname={nickname}
        onLeaveRoom={currentRoom ? handleLeaveRoom : undefined}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {currentRoom && encryptionKey ? (
          <>
            <div className="h-12 bg-surface-2/50 border-b border-bdr flex items-center px-4 shrink-0">
              <span className="text-sm font-medium text-txt font-mono tracking-wider">
                {currentRoom.name}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}?r=${currentRoom.name}`
                  ).then(() => {})
                }}
                className="ml-2 text-txt-4 hover:text-accent-400 text-xs transition"
                title="复制分享链接"
              >
                📋
              </button>
              <span className="ml-2 text-xs text-txt-4">
                · {onlineUsers.length} 人在线
              </span>
              {msgError && (
                <span className="text-xs text-red-400">{msgError}</span>
              )}
              <button
                onClick={() => setShowMembers(!showMembers)}
                className="sm:hidden ml-auto text-txt-3 hover:text-txt px-2 py-1 text-xs rounded hover:bg-surface-hover transition"
              >
                👥 {onlineUsers.length}
              </button>
            </div>

            <div className="flex-1 flex min-h-0">
              <div className="flex-1 flex flex-col min-w-0 min-h-0">
                <MessageList
                  messages={messages}
                  myNickname={nickname}
                  getDecrypted={getDecrypted}
                  getFileMeta={getFileMeta}
                  loadOriginalImage={loadOriginalImage}
                  onReply={(msg) => setReplyTo(msg)}
                  onRevoke={revokeMessage}
                  onRetry={retryMessage}
                />

                <MessageInput
                  onSend={(text) => sendMessage(text, replyTo)}
                  onSendImage={sendImage}
                  disabled={false}
                  sendingImage={sendingImage}
                  replyTo={replyTo}
                  onCancelReply={() => setReplyTo(null)}
                  getDecrypted={getDecrypted}
                  onlineUsers={onlineUsers}
                  imagePreview={imagePreview}
                  onSelectImage={selectImage}
                  onClearImagePreview={clearImagePreview}
                />
              </div>

              <MemberList
                members={onlineUsers}
                myNickname={nickname}
              />
            </div>

            {showMembers && (
              <div className="sm:hidden fixed inset-0 z-30">
                <div
                  className="absolute inset-0 bg-black/40"
                  onClick={() => setShowMembers(false)}
                />
                <div className="absolute right-0 top-0 bottom-0 w-64 bg-surface-2 border-l border-bdr shadow-xl">
                  <div className="flex items-center justify-between px-3 py-3 border-b border-bdr">
                    <h3 className="text-xs font-medium text-txt-3">在线成员 · {onlineUsers.length}</h3>
                    <button onClick={() => setShowMembers(false)} className="text-txt-4 hover:text-txt text-sm">✕</button>
                  </div>
                  <div className="overflow-y-auto py-1">
                    {onlineUsers.slice().sort((a, b) => {
                      if (a.nickname === nickname) return -1
                      if (b.nickname === nickname) return 1
                      return a.nickname.localeCompare(b.nickname)
                    }).map((user) => {
                      const isSelf = user.nickname === nickname
                      return (
                        <div key={user.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <div className="relative">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isSelf ? 'bg-accent-600 text-white' : 'bg-accent-100 text-accent-700 dark:bg-accent-900/60 dark:text-accent-300'}`}>
                              {user.nickname.charAt(0).toUpperCase()}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full border border-surface-2" />
                          </div>
                          <span className={`truncate ${isSelf ? 'text-txt font-medium' : 'text-txt-2'}`}>{user.nickname}</span>
                          {isSelf && <span className="text-[10px] text-accent-500 ml-auto">我</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : currentRoom ? (
          <div className="flex-1 flex items-center justify-center text-txt-4 text-sm">
            🔐 正在派生加密密钥...
          </div>
        ) : (
          <RoomEntry
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            loading={loading}
            error={joinError}
            onClearError={clearJoinError}
          />
        )}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ChatApp />
    </ThemeProvider>
  )
}
