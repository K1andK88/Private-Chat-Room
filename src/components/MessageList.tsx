import { useState, useEffect, useRef, useCallback } from 'react'
import type { ChatMessage, MessageStatus, FileMeta } from '../lib/types'
import { useIsMobile } from '../hooks/useIsMobile'
import { MESSAGE_TTL_MS, REVOKE_WINDOW_MS } from '../lib/types'
import { formatFileSize } from '../lib/imageUtils'

interface MessageListProps {
  messages: ChatMessage[]
  myNickname: string
  getDecrypted: (msg: ChatMessage) => Promise<string>
  getFileMeta: (msg: ChatMessage) => Promise<FileMeta | null>
  loadOriginalImage: (msg: ChatMessage) => Promise<string | null>
  onReply: (msg: ChatMessage) => void
  onRevoke: (msgId: string) => void
  onRetry: (msgId: string) => void
}

function StatusIcon({ status }: { status?: MessageStatus }) {
  if (!status || status === 'sent') {
    return <span className="text-accent-400/60" title="已送达">✔️</span>
  }
  if (status === 'sending') {
    return <span className="text-txt-4 animate-pulse" title="发送中...">⏳</span>
  }
  return <span className="text-red-400" title="发送失败">❌</span>
}

// ── Shared helpers for Lightbox ──

function useImageTransform() {
  const [scale, setScale] = useState(1)
  const [imgDragging, setImgDragging] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const pinchDistRef = useRef<number>(0)
  const pinchScaleRef = useRef<number>(1)

  const resetZoom = useCallback(() => { setScale(1); setPos({ x: 0, y: 0 }) }, [])

  const clampPos = useCallback((p: { x: number; y: number }, s: number, cw: number, ch: number) => {
    if (s <= 1) return { x: 0, y: 0 }
    const maxX = Math.max(0, (s - 0.3) * cw / 2)
    const maxY = Math.max(0, (s - 0.3) * ch / 2)
    return { x: Math.max(-maxX, Math.min(maxX, p.x)), y: Math.max(-maxY, Math.min(maxY, p.y)) }
  }, [])

  const handleImgMouseDown = useCallback((e: React.MouseEvent, _containerW: number, _containerH: number) => {
    if (scale <= 1) return
    e.stopPropagation()
    e.preventDefault()
    setImgDragging(true)
    setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y })
  }, [scale, pos])

  const handleImgTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.stopPropagation()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      pinchDistRef.current = Math.hypot(dx, dy)
      pinchScaleRef.current = scale
      return
    }
    if (scale <= 1 || e.touches.length !== 1) return
    e.stopPropagation()
    setImgDragging(true)
    setDragStart({ x: e.touches[0].clientX - pos.x, y: e.touches[0].clientY - pos.y })
  }, [scale, pos])

  const handleImgMouseMove = useCallback((e: React.MouseEvent, containerW: number, containerH: number) => {
    if (!imgDragging) return
    const next = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }
    setPos(clampPos(next, scale, containerW, containerH))
  }, [imgDragging, dragStart, scale, clampPos])

  const handleImgTouchMove = useCallback((e: React.TouchEvent, containerW: number, containerH: number) => {
    if (e.touches.length === 2 && pinchDistRef.current > 0) {
      e.stopPropagation()
      e.preventDefault()
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.hypot(dx, dy)
      const ratio = dist / pinchDistRef.current
      setScale(Math.min(Math.max(pinchScaleRef.current * ratio, 0.2), 5))
      return
    }
    if (!imgDragging || e.touches.length !== 1) return
    const next = { x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y }
    setPos(clampPos(next, scale, containerW, containerH))
  }, [imgDragging, dragStart, scale, clampPos])

  const handleImgMouseUp = useCallback(() => setImgDragging(false), [])

  const handleImgTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchDistRef.current = 0
    if (e.touches.length === 0) setImgDragging(false)
  }, [])

  return {
    scale, setScale, imgDragging, pos, resetZoom,
    handleImgMouseDown, handleImgTouchStart,
    handleImgMouseMove, handleImgTouchMove,
    handleImgMouseUp, handleImgTouchEnd,
  }
}

function ImageLightbox({
  url,
  onClose,
  fileName,
}: {
  url: string
  onClose: () => void
  fileName?: string
}) {
  const isMobile = useIsMobile()

  if (isMobile) return <MobileLightbox url={url} onClose={onClose} fileName={fileName} />
  return <DesktopLightbox url={url} onClose={onClose} fileName={fileName} />
}

// ── Mobile: fullscreen mode ──

function MobileLightbox({ url, onClose, fileName }: { url: string; onClose: () => void; fileName?: string }) {
  const transform = useImageTransform()
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)

  const handleDownload = () => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const ext = (fileName?.match(/\.[^.]+$/) || ['.png'])[0]
    const a = document.createElement('a')
    a.href = url
    a.download = `${ts}${ext}`
    a.target = '_blank'
    a.rel = 'noopener'
    a.click()
  }

  // Track touch start for close-gesture detection
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    const { x, y, time } = touchStartRef.current
    touchStartRef.current = null
    // Only close if: single touch ended, no drag, short tap (< 300ms), scale == 1
    if (transform.scale !== 1) return
    if (Date.now() - time > 300) return
    const dx = (e.changedTouches[0]?.clientX ?? x) - x
    const dy = (e.changedTouches[0]?.clientY ?? y) - y
    if (Math.hypot(dx, dy) < 10) {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Top toolbar — floating, semi-transparent */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/50 z-10">
        <div className="flex items-center gap-2">
          <button
            onClick={transform.resetZoom}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/70 text-xs rounded-lg active:bg-white/10"
          >
            {Math.round(transform.scale * 100)}%
          </button>
          <button
            onClick={() => transform.setScale(s => Math.min(s + 0.25, 5))}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/70 text-lg rounded-lg active:bg-white/10"
          >
            ➕
          </button>
          <button
            onClick={() => transform.setScale(s => Math.max(s - 0.25, 0.2))}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/70 text-lg rounded-lg active:bg-white/10"
          >
            ➖
          </button>
          <button
            onClick={handleDownload}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/70 text-lg rounded-lg active:bg-white/10"
          >
            💾
          </button>
        </div>
        <button
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white text-xl rounded-lg active:bg-white/10"
        >
          ✕
        </button>
      </div>

      {/* Image area */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden touch-none"
        onTouchStart={(e) => { transform.handleImgTouchStart(e); handleTouchStart(e) }}
        onTouchMove={(e) => transform.handleImgTouchMove(e, containerRef.current?.clientWidth ?? 0, containerRef.current?.clientHeight ?? 0)}
        onTouchEnd={(e) => { transform.handleImgTouchEnd(e); handleTouchEnd(e) }}
        onMouseDown={(e) => transform.handleImgMouseDown(e, containerRef.current?.clientWidth ?? 0, containerRef.current?.clientHeight ?? 0)}
        onMouseMove={(e) => transform.handleImgMouseMove(e, containerRef.current?.clientWidth ?? 0, containerRef.current?.clientHeight ?? 0)}
        onMouseUp={transform.handleImgMouseUp}
        onMouseLeave={transform.handleImgMouseUp}
      >
        <img
          ref={imgRef}
          src={url}
          alt="preview"
          className="max-w-full max-h-full object-contain select-none"
          style={{
            transform: `scale(${transform.scale}) translate(${transform.pos.x / transform.scale}px, ${transform.pos.y / transform.scale}px)`,
            transition: transform.imgDragging ? 'none' : 'transform 0.15s ease',
          }}
          draggable={false}
        />
      </div>
    </div>
  )
}

// ── Desktop: window mode (original, with boundary constraints added) ──

function DesktopLightbox({ url, onClose, fileName }: { url: string; onClose: () => void; fileName?: string }) {
  const transform = useImageTransform()
  const imgRef = useRef<HTMLImageElement>(null)

  const [winPos, setWinPos] = useState({ x: 0, y: 0 })
  const [winSize, setWinSize] = useState({ w: 0, h: 0 })
  const [winDragging, setWinDragging] = useState(false)
  const [winDragStart, setWinDragStart] = useState({ mx: 0, my: 0, wx: 0, wy: 0 })

  // Close with movement threshold (prevent accidental close on drag)
  const mouseDownRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    const onLoaded = () => {
      const iw = img.naturalWidth
      const ih = img.naturalHeight
      const vw = window.innerWidth * 0.85
      const vh = window.innerHeight * 0.80
      const ratio = iw / ih
      let w: number, h: number
      if (ratio > vw / vh) { w = Math.min(iw, vw); h = w / ratio }
      else { h = Math.min(ih, vh); w = h * ratio }
      w = Math.max(w, 300); h = Math.max(h, 200)
      setWinSize({ w: Math.round(w), h: Math.round(h) })
      setWinPos({ x: Math.round((window.innerWidth - w) / 2), y: Math.round((window.innerHeight - h - 40) / 2) })
    }
    if (img.complete) onLoaded()
    else img.addEventListener('load', onLoaded)
    return () => img.removeEventListener('load', onLoaded)
  }, [url])

  // Zoom via wheel
  // transform.setScale is a React state setter — stable reference, safe to omit from deps
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    transform.setScale(prev => Math.min(Math.max(prev - e.deltaY * 0.002, 0.2), 5))
  }, [])

  useEffect(() => {
    const el = imgRef.current?.parentElement
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // Window drag with boundary constraints
  const handleWinMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setWinDragging(true)
    setWinDragStart({ mx: e.clientX, my: e.clientY, wx: winPos.x, wy: winPos.y })
  }

  const handleWinTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    setWinDragging(true)
    setWinDragStart({ mx: e.touches[0].clientX, my: e.touches[0].clientY, wx: winPos.x, wy: winPos.y })
  }

  useEffect(() => {
    if (!winDragging) return
    const clampWin = (x: number, y: number) => ({
      x: Math.max(-winSize.w + 80, Math.min(x, window.innerWidth - 80)),
      y: Math.max(0, Math.min(y, window.innerHeight - 60)),
    })
    const onMouseMove = (e: MouseEvent) => setWinPos(clampWin(
      winDragStart.wx + (e.clientX - winDragStart.mx),
      winDragStart.wy + (e.clientY - winDragStart.my)
    ))
    const onTouchMove = (e: TouchEvent) => setWinPos(clampWin(
      winDragStart.wx + (e.touches[0].clientX - winDragStart.mx),
      winDragStart.wy + (e.touches[0].clientY - winDragStart.my)
    ))
    const onUp = () => setWinDragging(false)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [winDragging, winDragStart, winSize.w])

  const handleDownload = () => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const ext = (fileName?.match(/\.[^.]+$/) || ['.png'])[0]
    const a = document.createElement('a')
    a.href = url
    a.download = `${ts}${ext}`
    a.target = '_blank'
    a.rel = 'noopener'
    a.click()
  }

  // Background click to close, with drag threshold
  const handleBgMouseDown = (e: React.MouseEvent) => {
    mouseDownRef.current = { x: e.clientX, y: e.clientY }
  }
  const handleBgClick = (e: React.MouseEvent) => {
    if (!mouseDownRef.current) { onClose(); return }
    const dx = e.clientX - mouseDownRef.current.x
    const dy = e.clientY - mouseDownRef.current.y
    mouseDownRef.current = null
    if (Math.hypot(dx, dy) < 5) onClose()
  }

  return (
    <div className="fixed inset-0 z-50" onMouseDown={handleBgMouseDown} onClick={handleBgClick}>
      <div
        className="absolute bg-surface dark:bg-surface shadow-2xl border border-bdr flex flex-col"
        style={{ left: winPos.x, top: winPos.y, width: winSize.w || 400, height: (winSize.h || 300) + 40 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="h-[40px] shrink-0 flex items-center justify-end px-3 bg-surface-2 dark:bg-surface-2 border-b border-bdr cursor-move select-none"
          onMouseDown={handleWinMouseDown}
          onTouchStart={handleWinTouchStart}
        >
          <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button onClick={transform.resetZoom} className="px-2 py-1 bg-surface hover:bg-surface-hover text-txt-3 text-xs rounded transition">{Math.round(transform.scale * 100)}%</button>
            <button onClick={() => transform.setScale(s => Math.min(s + 0.25, 5))} className="px-2 py-1 bg-surface hover:bg-surface-hover text-txt-3 text-xs rounded transition">➕</button>
            <button onClick={() => transform.setScale(s => Math.max(s - 0.25, 0.2))} className="px-2 py-1 bg-surface hover:bg-surface-hover text-txt-3 text-xs rounded transition">➖</button>
            <button onClick={handleDownload} className="px-2 py-1 bg-surface hover:bg-surface-hover text-txt-3 text-xs rounded transition">💾</button>
            <button onClick={onClose} className="px-2 py-1 bg-surface hover:bg-surface-hover text-txt-3 text-xs rounded transition">✕</button>
          </div>
        </div>
        <div
          className="flex-1 overflow-hidden bg-surface-2/30 flex items-center justify-center"
          onMouseDown={(e) => transform.handleImgMouseDown(e, winSize.w, winSize.h)}
          onMouseMove={(e) => transform.handleImgMouseMove(e, winSize.w, winSize.h)}
          onMouseUp={transform.handleImgMouseUp}
          onMouseLeave={transform.handleImgMouseUp}
          onTouchStart={transform.handleImgTouchStart}
          onTouchMove={(e) => transform.handleImgTouchMove(e, winSize.w, winSize.h)}
          onTouchEnd={transform.handleImgTouchEnd}
        >
          <img
            ref={imgRef}
            src={url}
            alt="preview"
            className="max-w-full max-h-full object-contain select-none cursor-grab active:cursor-grabbing"
            style={{
              transform: `scale(${transform.scale}) translate(${transform.pos.x / transform.scale}px, ${transform.pos.y / transform.scale}px)`,
              transition: transform.imgDragging ? 'none' : 'transform 0.15s ease',
            }}
            draggable={false}
          />
        </div>
      </div>
    </div>
  )
}

export default function MessageList({
  messages, myNickname, getDecrypted, getFileMeta, loadOriginalImage,
  onReply, onRevoke, onRetry,
}: MessageListProps) {
  const [decryptedMessages, setDecryptedMessages] = useState<Map<string, string>>(new Map())
  const [thumbnails, setThumbnails] = useState<Map<string, FileMeta>>(new Map())
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [lightboxFileName, setLightboxFileName] = useState<string>('')
  const [loadingImage, setLoadingImage] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // Tick every 30s to refresh TTL display
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  const bottomRef = useRef<HTMLDivElement>(null)

  // Decrypt text messages
  useEffect(() => {
    messages.forEach(async (msg) => {
      if (msg.msg_type !== 'text') return
      if (decryptedMessages.has(msg.id) && msg.status !== 'sending') return
      try {
        const text = await getDecrypted(msg)
        setDecryptedMessages((prev) => new Map(prev).set(msg.id, text))
      } catch { /* skip failed decryption */ }
    })
  }, [messages, getDecrypted])

  // Decrypt file meta for images, also extract nickname from payload
  useEffect(() => {
    messages.forEach(async (msg) => {
      if (msg.msg_type !== 'image') return
      if (thumbnails.has(msg.id)) return
      try {
        // Extract nickname from encrypted payload
        if (!msg._nick && msg.payload.ciphertext) {
          await getDecrypted(msg)
        }
        const meta = await getFileMeta(msg)
        if (meta) {
          setThumbnails((prev) => new Map(prev).set(msg.id, meta))
        }
      } catch { /* skip failed decryption */ }
    })
  }, [messages, getFileMeta, getDecrypted])

  // Auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp)
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  const isOwn = (msg: ChatMessage) => (msg._nick || msg.sender_nickname) === myNickname
  const getTTL = (timestamp: number) => {
    void tick
    const elapsed = Date.now() - timestamp
    const remaining = MESSAGE_TTL_MS - elapsed
    if (remaining <= 0) return '已过期'
    return `${Math.floor(remaining / 60000)}分钟`
  }

  const canRevoke = (msg: ChatMessage) =>
    isOwn(msg) && msg.action !== 'revoke' && Date.now() - msg.created_at < REVOKE_WINDOW_MS

  const highlightMentions = (text: string) => {
    const parts = text.split(/(@\S+)/g)
    return parts.map((part, i) =>
      part.startsWith('@') ? (
        <span key={i} className="text-accent-400 font-medium">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    )
  }

  const getReplyTarget = (replyToId: string) => {
    return messages.find((m) => m.id === replyToId)
  }

  const handleImageClick = async (msg: ChatMessage) => {
    if (loadingImage) return
    setLoadingImage(msg.id)

    const url = await loadOriginalImage(msg)
    if (url) {
      const meta = thumbnails.get(msg.id)
      setLightboxUrl(url)
      setLightboxFileName(meta?.fileName || 'image')
    } else {
      alert('原图已过期或加载失败')
    }

    setLoadingImage(null)
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-txt-4 text-sm">
        <div className="text-center">
          <div className="text-4xl mb-3">💬</div>
          <p>暂无消息</p>
          <p className="text-xs mt-1">发送第一条消息开始聊天</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const own = isOwn(msg)

          if (msg.action === 'revoke') {
            return (
              <div key={msg.id} className="flex justify-center msg-enter">
                <div className="text-xs sm:text-[19px] text-txt-4 bg-surface-2/50 px-3 py-1.5 rounded-full">
                  {own ? '你' : (msg._nick || msg.sender_nickname)} 撤回了一条消息
                </div>
              </div>
            )
          }

          const replyTarget = msg.reply_to_id ? getReplyTarget(msg.reply_to_id) : null
          let replyText: string | null = null
          let replyRevoked = false
          if (replyTarget) {
            replyRevoked = replyTarget.action === 'revoke'
            replyText = replyRevoked
              ? null
              : (decryptedMessages.get(replyTarget.id) ?? '...')
          }

          const isImage = msg.msg_type === 'image'
          const meta = isImage ? thumbnails.get(msg.id) : null
          const decrypted = isImage
            ? '📷 图片'
            : (decryptedMessages.get(msg.id) ?? '解密中...')

          return (
            <div key={msg.id} className={`flex ${own ? 'justify-end' : 'justify-start'} msg-enter`}>
              <div
                className={`max-w-[75%] sm:max-w-[60%] rounded-2xl border ${
                  own
                    ? 'bg-accent-600 text-white rounded-br-md border-accent-700'
                    : 'bg-surface-2 text-txt rounded-bl-md border-bdr'
                }`}
              >
                {/* Reply preview */}
                {replyText && (
                  <div className="px-3 py-1.5 border-l-2 border-accent-400/60 bg-white/5 rounded-tr-lg rounded-bl-lg mx-1 mt-2">
                    <div className="text-[11px] sm:text-[17px] text-accent-300 mb-0.5">
                      {replyTarget?._nick || replyTarget?.sender_nickname}
                    </div>
                    <div className="text-xs sm:text-[19px] text-txt-3 truncate">{replyText}</div>
                  </div>
                )}
                {replyRevoked && (
                  <div className="px-3 py-1.5 border-l-2 border-bdr bg-white/5 rounded-tr-lg rounded-bl-lg mx-1 mt-2">
                    <div className="text-[11px] sm:text-[17px] text-txt-3 mb-0.5">
                      {replyTarget?._nick || replyTarget?.sender_nickname}
                    </div>
                    <div className="text-xs sm:text-[19px] text-txt-3 italic">原消息已撤回</div>
                  </div>
                )}

                {/* Message bubble */}
                <div className="px-4 py-2.5">
                  {!own && (
                    <div className="text-xs sm:text-[19px] text-accent-400 mb-1">{msg._nick || msg.sender_nickname}</div>
                  )}

                  {/* Image message */}
                  {isImage && meta ? (
                    <div
                      className="cursor-pointer relative group"
                      onClick={() => handleImageClick(msg)}
                    >
                      <img
                        src={meta.thumbnail}
                        alt={meta.fileName}
                        className="max-w-full rounded-lg border border-white/10"
                        style={{ maxHeight: '300px', objectFit: 'cover' }}
                      />
                      {loadingImage === msg.id && (
                        <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center">
                          <span className="text-white text-sm animate-pulse">加载中...</span>
                        </div>
                      )}
                      <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition text-white text-xs bg-black/50 px-2 py-1 rounded">
                        🔍 查看原图
                      </div>
                      <div className="mt-1 text-xs opacity-70">
                        📷 图片 · {formatFileSize(meta.fileSize)}
                      </div>
                    </div>
                  ) : isImage && !meta ? (
                    <div className="text-sm sm:text-[21px] opacity-70">🖼️ 图片解密中...</div>
                  ) : (
                    /* Text message */
                    <div className="text-sm sm:text-[21px] break-words whitespace-pre-wrap">
                      {highlightMentions(decrypted)}
                    </div>
                  )}

                  <div className={`text-xs mt-1 flex items-center gap-2 ${own ? 'text-accent-100/80' : 'text-txt-3'}`}>
                    <span>{formatTime(msg.created_at)}</span>
                    <span className="opacity-70">💨 {getTTL(msg.created_at)}</span>
                    {own && <StatusIcon status={msg.status} />}
                  </div>
                </div>

                {/* Failed retry */}
                {msg.status === 'failed' && (
                  <div className="flex items-center justify-center px-3 pb-1.5">
                    <button
                      onClick={() => onRetry(msg.id)}
                      className="text-[11px] sm:text-[17px] text-txt-3 hover:text-txt-2 px-2 py-0.5 rounded transition flex items-center gap-1"
                      title="重发"
                    >
                      <span>⚠️</span> 发送失败，点击重试
                    </button>
                  </div>
                )}

                {/* Context menu */}
                <div className="flex gap-1 px-2 pb-1.5">
                  <button
                    onClick={() => onReply(msg)}
                    className="text-[11px] sm:text-[17px] text-txt-3 hover:text-txt-2 px-1.5 py-0.5 rounded transition"
                    title="回复"
                  >
                    ↩ 回复
                  </button>
                  {canRevoke(msg) && (
                    <button
                      onClick={() => onRevoke(msg.id)}
                      className="text-[11px] sm:text-[17px] text-txt-3 hover:text-txt-2 px-1.5 py-0.5 rounded transition"
                      title="撤回"
                    >
                      ↩ 撤回
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <ImageLightbox
          url={lightboxUrl}
          fileName={lightboxFileName}
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </>
  )
}
