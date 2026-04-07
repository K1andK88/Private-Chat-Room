import { useState, useRef, useEffect } from 'react'
import type { ChatMessage, PresenceUser } from '../lib/types'
import EmojiPicker from './EmojiPicker'

interface MessageInputProps {
  onSend: (text: string) => void
  onSendImage: (file: File) => void
  disabled: boolean
  sendingImage: boolean
  replyTo: ChatMessage | null
  onCancelReply: () => void
  getDecrypted: (msg: ChatMessage) => Promise<string>
  onlineUsers: PresenceUser[]
  imagePreview: { file: File; preview: string } | null
  onSelectImage: (file: File) => void
  onClearImagePreview: () => void
}

export default function MessageInput({
  onSend, onSendImage, disabled, sendingImage,
  replyTo, onCancelReply, getDecrypted, onlineUsers,
  imagePreview, onSelectImage, onClearImagePreview,
}: MessageInputProps) {
  const [text, setText] = useState('')
  const [mentionQuery, setMentionQuery] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [mentionStartPos, setMentionStartPos] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!replyTo) { setReplyText(''); return }
    if (replyTo._plaintext) { setReplyText(replyTo._plaintext); return }
    if (replyTo.msg_type === 'image') { setReplyText('📷 图片'); return }
    getDecrypted(replyTo).then(setReplyText).catch(() => setReplyText(''))
  }, [replyTo, getDecrypted])
  const mentionsRef = useRef<HTMLDivElement>(null)

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!text.trim() || disabled) return
    onSend(text.trim())
    setText('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && mentionsRef.current) {
      if (e.key === 'Escape') {
        setShowMentions(false)
        return
      }
    }
    if (showEmoji && e.key === 'Escape') {
      setShowEmoji(false)
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
      return
    }

    if (e.key === '@') {
      const pos = inputRef.current?.selectionStart ?? text.length
      setMentionStartPos(pos)
      setMentionQuery('')
      setShowMentions(true)
    }
  }

  const handleInput = () => {
    const el = inputRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }

    if (showMentions) {
      const pos = el?.selectionStart ?? text.length
      const textAfterAt = text.slice(mentionStartPos + 1, pos)
      if (textAfterAt.includes(' ') || textAfterAt.length > 20) {
        setShowMentions(false)
      } else {
        setMentionQuery(textAfterAt.toLowerCase())
      }
    }
  }

  const insertMention = (user: PresenceUser) => {
    const before = text.slice(0, mentionStartPos)
    const after = text.slice((inputRef.current?.selectionStart ?? text.length))
    const newText = `${before}@${user.nickname} ${after}`
    setText(newText)
    setShowMentions(false)
    inputRef.current?.focus()
  }

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current
    const pos = el?.selectionStart ?? text.length
    const newText = text.slice(0, pos) + emoji + text.slice(pos)
    setText(newText)
    el?.focus()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onSelectImage(file)
    }
    // Reset so same file can be selected again
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      onSelectImage(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleSendImage = () => {
    if (imagePreview) {
      onSendImage(imagePreview.file)
    }
  }

  const filteredUsers = mentionQuery
    ? onlineUsers.filter((u) => u.nickname.toLowerCase().includes(mentionQuery))
    : onlineUsers

  return (
    <div
      className="border-t border-bdr bg-surface-2/50"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Reply indicator */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-surface-3/50 border-b border-bdr text-[15px]">
          <span className="text-accent-400 font-medium">↩ 回复</span>
          <span className="text-txt-3 truncate">{replyTo._nick || replyTo.sender_nickname}：{replyText}</span>
          <button
            onClick={onCancelReply}
            className="ml-auto text-txt-4 hover:text-txt-2 transition"
          >
            ✕
          </button>
        </div>
      )}

      {/* Image preview bar */}
      {imagePreview && (
        <div className="flex items-center gap-3 px-4 py-2 bg-surface-3/50 border-b border-bdr">
          <img
            src={imagePreview.preview}
            alt="preview"
            className="w-12 h-12 object-cover rounded-lg border border-bdr"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-txt truncate">{imagePreview.file.name}</p>
            <p className="text-xs text-txt-3">
              {(imagePreview.file.size / 1024).toFixed(1)}KB
            </p>
          </div>
          <button
            onClick={handleSendImage}
            disabled={sendingImage}
            className="px-3 py-1.5 bg-accent-600 hover:bg-accent-700 disabled:opacity-50 text-white text-xs rounded-lg transition"
          >
            {sendingImage ? '发送中...' : '发送'}
          </button>
          <button
            onClick={onClearImagePreview}
            className="text-txt-4 hover:text-txt-2 text-sm transition"
          >
            ✕
          </button>
        </div>
      )}

      <div className="p-3 relative">
        {/* Emoji picker */}
        {showEmoji && (
          <EmojiPicker
            onSelect={insertEmoji}
            onClose={() => setShowEmoji(false)}
          />
        )}

        {/* Mention picker */}
        {showMentions && filteredUsers.length > 0 && (
          <div
            ref={mentionsRef}
            className="absolute bottom-full left-3 mb-1 bg-surface-3 border border-bdr rounded-lg shadow-xl overflow-hidden z-10 min-w-[160px] max-w-[calc(100vw-2rem)]"
          >
            {filteredUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => insertMention(u)}
                className="w-full px-3 py-2 text-left text-sm text-txt-2 hover:bg-surface-hover hover:text-txt transition"
              >
                <span className="text-accent-400">@</span>
                {u.nickname}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          {/* Emoji button */}
          <button
            type="button"
            onClick={() => { setShowEmoji(!showEmoji); setShowMentions(false) }}
            className="px-2 py-2.5 text-txt-3 hover:text-txt rounded-lg hover:bg-surface-hover transition shrink-0"
            title="表情"
          >
            😊
          </button>

          {/* Image attachment button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || sendingImage}
            className="px-2 py-2.5 text-txt-3 hover:text-txt rounded-lg hover:bg-surface-hover transition shrink-0 disabled:opacity-40"
            title="发送图片"
          >
            🖼️
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={disabled ? '加入房间后发送消息...' : '输入消息... (@提及)'}
            disabled={disabled}
            rows={1}
            enterKeyHint="send"
            className="flex-1 px-4 py-2.5 bg-surface-3 border border-bdr rounded-xl text-txt text-sm placeholder-txt-3 focus:outline-none focus:border-accent-500 resize-none disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={disabled || !text.trim()}
            className="px-4 py-2.5 bg-accent-600 hover:bg-accent-700 disabled:bg-surface-3 disabled:text-txt-4 text-white rounded-xl transition shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          </button>
        </form>
      </div>
      <p className="text-[10px] text-txt-4 text-center pb-1.5">
        🔐 端到端加密 · Enter发送 · Shift+Enter换行 · @提及 · 拖拽图片
      </p>
    </div>
  )
}
