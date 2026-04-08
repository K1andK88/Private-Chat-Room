import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  encryptMessage, decryptMessage, deriveKey,
  encryptBuffer, decryptBuffer, encryptJSON, decryptJSON,
} from '../lib/crypto'
import {
  uploadEncryptedFile, downloadEncryptedFile, buildFileKey,
} from '../lib/storage'
import {
  validateImageFile, getImageDimensions, generateThumbnail, readFileAsArrayBuffer,
} from '../lib/imageUtils'
import { savePendingUpload, getPendingUploads, removePendingUpload } from '../lib/pendingUploads'
import { playNotificationSound } from '../lib/sound'
import type {
  ChatMessage, BroadcastMessage, MessageAction, MessageStatus,
  MessageType, FileMeta, EncryptedPayload,
} from '../lib/types'
import { MESSAGE_TTL_MS, HISTORY_LIMIT } from '../lib/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

const IV_LENGTH = 12

export interface NotificationConfig {
  enabled: boolean
  sound: boolean
  soundId: string    // 'system' | 'ding' | 'bell' | 'bubble' | 'synth' | 'marimba' | 'custom'
  volume: number    // 0..1
}

export function useMessages(
  roomId: string | null,
  roomPassword: string,
  nickname: string,
  onRoomDeleted?: () => void,
  notifConfig?: NotificationConfig
) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null)
  const [error, setErrorRaw] = useState<string | null>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setError = useCallback((msg: string | null) => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current)
      errorTimerRef.current = null
    }
    setErrorRaw(msg)
    if (msg) {
      errorTimerRef.current = setTimeout(() => setErrorRaw(null), 4000)
    }
  }, [])
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [sendingImage, setSendingImage] = useState(false)
  const [imagePreview, setImagePreview] = useState<{ file: File; preview: string } | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const cleanupRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingRef = useRef<Map<string, string>>(new Map())
  const imageCacheRef = useRef<Map<string, string>>(new Map())
  const unreadCountRef = useRef(0)
  const notifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeNotifRef = useRef<Notification | null>(null)
  const bumpUnreadRef = useRef<() => void>(() => {})

  // Desktop notification on new message (only when page hidden + enabled)
  const bumpUnread = useCallback((senderNick?: string) => {
    if (!document.hidden) return
    if (!notifConfig?.enabled) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return

    unreadCountRef.current += 1
    const count = unreadCountRef.current

    // Close previous timeout
    if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current)

    // Close previous notification and create updated one
    if (activeNotifRef.current) activeNotifRef.current.close()

    const body = count === 1
      ? (senderNick ? `${senderNick} 发来新消息` : '新消息')
      : `${count} 条新消息`

    const n = new Notification('Private Chat', {
      body,
      tag: 'chat-message',
      silent: notifConfig.soundId !== 'system' || !notifConfig.sound,
    })
    activeNotifRef.current = n

    // Play custom/built-in sound via Audio API (not system default)
    if (notifConfig.sound && notifConfig.soundId !== 'system') {
      playNotificationSound(notifConfig.soundId, notifConfig.volume)
    }

    notifTimeoutRef.current = setTimeout(() => {
      n.close()
      if (activeNotifRef.current === n) activeNotifRef.current = null
    }, 5000)
  }, [notifConfig?.enabled, notifConfig?.sound, notifConfig?.soundId, notifConfig?.volume])

  bumpUnreadRef.current = bumpUnread

  // Reset unread when page becomes visible
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        unreadCountRef.current = 0
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // Clear messages when room changes
  useEffect(() => {
    setMessages([])
    setError(null)
    setReplyTo(null)
    pendingRef.current.clear()
    imageCacheRef.current.forEach((url) => URL.revokeObjectURL(url))
    imageCacheRef.current.clear()
  }, [roomId])

  // Derive key
  useEffect(() => {
    if (!roomId || !roomPassword) {
      setEncryptionKey(null)
      return
    }
    deriveKey(roomPassword, roomId)
      .then(setEncryptionKey)
      .catch(() => setError('密钥派生失败'))
  }, [roomId, roomPassword])

  // Load message history from DB
  const loadHistory = useCallback(async () => {
    if (!roomId || !encryptionKey) return

    try {
      const { data, error: dbError } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(HISTORY_LIMIT)

      if (dbError) {
        console.error('Load history error:', dbError)
        return
      }

      if (!data || data.length === 0) return

      const now = Date.now()
      const historyMsgs: ChatMessage[] = data.map((row: Record<string, unknown>) => ({
        id: row.id as string,
        room_id: row.room_id as string,
        sender_nickname: row.sender_nickname as string,
        msg_type: (row.msg_type as MessageType) || 'text',
        payload: row.payload as EncryptedPayload,
        file_meta_encrypted: row.file_meta_encrypted as EncryptedPayload | undefined,
        created_at: row.created_at as number,
        action: (row.action as MessageAction) || 'none',
        revoked_by: row.revoked_by as string | undefined,
        reply_to_id: row.reply_to_id as string | undefined,
        status: 'sent' as MessageStatus,
      })).filter((m) => now - m.created_at < MESSAGE_TTL_MS)

      setMessages(historyMsgs)
    } catch (err) {
      console.error('Load history failed:', err)
    }
  }, [roomId, encryptionKey])

  // Subscribe to broadcast
  useEffect(() => {
    if (!roomId) return

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const ch = supabase.channel(`messages:${roomId}`, {
      config: { broadcast: { self: true } },
    })

    ch.on('broadcast', { event: 'message' }, ({ payload }) => {
      const msg = payload as BroadcastMessage

      if (msg.type === 'revoke' && msg.message_id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.message_id
              ? { ...m, action: 'revoke' as MessageAction, revoked_by: m._nick || m.sender_nickname }
              : m
          )
        )
        return
      }

      if (msg.type === 'message' && msg.payload) {
        bumpUnreadRef.current()
        const chatMsg: ChatMessage = {
          id: msg.message_id || crypto.randomUUID(),
          room_id: msg.room_id,
          sender_nickname: msg.sender_nickname,
          msg_type: msg.msg_type || 'text',
          payload: msg.payload,
          file_meta_encrypted: msg.file_meta_encrypted,
          created_at: msg.timestamp,
          action: 'none' as MessageAction,
          reply_to_id: msg.reply_to_id,
        }
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === chatMsg.id)
          if (exists) {
            return prev.map((m) =>
              m.id === chatMsg.id
                ? { ...m, status: 'sent' as MessageStatus, _plaintext: undefined }
                : m
            )
          }
          return [...prev, chatMsg]
        })
      }
    })

    ch.subscribe()
    channelRef.current = ch

    loadHistory()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [roomId, loadHistory])

  // Retry pending image uploads from IndexedDB
  const retryPendingUploads = useCallback(async () => {
    if (!roomId || !encryptionKey) return
    const pending = await getPendingUploads()
    const roomPending = pending.filter((p) => p.roomId === roomId)

    for (const item of roomPending) {
      // Skip if message has expired
      if (Date.now() - item.createdAt >= MESSAGE_TTL_MS) {
        // Delete expired message from DB
        await supabase.from('messages').delete().eq('id', item.msgId)
        await removePendingUpload(item.msgId)
        continue
      }

      try {
        await uploadEncryptedFile(item.roomId, item.msgId, new Uint8Array(item.uploadData))
        await removePendingUpload(item.msgId)
        // Update UI: mark message as sent
        setMessages((prev) =>
          prev.map((m) =>
            m.id === item.msgId ? { ...m, status: 'sent' as MessageStatus } : m
          )
        )
        console.log('[image] retry upload succeeded:', item.msgId)
      } catch {
        // Still failing, keep in IndexedDB for next attempt
        console.log('[image] retry upload still failing:', item.msgId)
      }
    }

    // Clean up expired uploads from other rooms
    const otherPending = pending.filter((p) => p.roomId !== roomId)
    for (const item of otherPending) {
      if (Date.now() - item.createdAt >= MESSAGE_TTL_MS) {
        await supabase.from('messages').delete().eq('id', item.msgId)
        await removePendingUpload(item.msgId)
      }
    }
  }, [roomId, encryptionKey])

  useEffect(() => {
    retryPendingUploads()
  }, [retryPendingUploads])

  // TTL cleanup
  useEffect(() => {
    if (cleanupRef.current) clearInterval(cleanupRef.current)
    cleanupRef.current = setInterval(() => {
      setMessages((prev) => {
        const now = Date.now()
        const filtered = prev.filter((m) => now - m.created_at < MESSAGE_TTL_MS)
        return filtered.length !== prev.length ? filtered : prev
      })
    }, 60_000)
    return () => {
      if (cleanupRef.current) clearInterval(cleanupRef.current)
    }
  }, [])

  // Mark sending messages as sent after timeout
  useEffect(() => {
    const timer = setInterval(() => {
      setMessages((prev) => {
        let changed = false
        const updated = prev.map((m) => {
          if (m.status === 'sending' && Date.now() - m.created_at > 3000) {
            changed = true
            return { ...m, status: 'sent' as MessageStatus, _plaintext: undefined }
          }
          return m
        })
        return changed ? updated : prev
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Build encrypted payload that includes nickname
  const encryptPayload = useCallback(async (text: string, nick: string) => {
    return encryptMessage(JSON.stringify({ n: nick, t: text }), encryptionKey!)
  }, [encryptionKey])

  // Save message to DB
  const saveToDB = useCallback(async (msg: ChatMessage) => {
    const { error: dbError } = await supabase.from('messages').insert({
      id: msg.id,
      room_id: msg.room_id,
      sender_nickname: msg.sender_nickname,
      msg_type: msg.msg_type,
      payload: msg.payload,
      file_meta_encrypted: msg.file_meta_encrypted || null,
      reply_to_id: msg.reply_to_id || null,
      action: msg.action,
      created_at: msg.created_at,
    })
    if (dbError) {
      throw dbError
    }
  }, [])

  // Send text message
  const sendMessage = useCallback(
    async (plaintext: string, replyToMsg?: ChatMessage | null) => {
      if (!roomId || !encryptionKey || !plaintext.trim()) return
      const msgId = crypto.randomUUID()

      const optimisticMsg: ChatMessage = {
        id: msgId,
        room_id: roomId,
        sender_nickname: '',
        msg_type: 'text',
        payload: { ciphertext: '', iv: '' },
        created_at: Date.now(),
        action: 'none',
        reply_to_id: replyToMsg?.id,
        status: 'sending',
        _plaintext: plaintext,
        _nick: nickname,
      }
      setMessages((prev) => [...prev, optimisticMsg])
      setReplyTo(null)

      try {
        const payload = await encryptPayload(plaintext, nickname)
        pendingRef.current.set(msgId, plaintext)

        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, payload, status: 'sent' as MessageStatus, _plaintext: undefined } : m))
        )
        pendingRef.current.delete(msgId)

        // Save to DB first, then broadcast
        await saveToDB({ ...optimisticMsg, payload, status: 'sent' })

        channelRef.current?.send({
          type: 'broadcast',
          event: 'message',
          payload: {
            type: 'message',
            sender_nickname: '',
            room_id: roomId,
            msg_type: 'text',
            payload,
            message_id: msgId,
            reply_to_id: replyToMsg?.id,
            timestamp: Date.now(),
          } satisfies BroadcastMessage,
        })
      } catch (err: unknown) {
        // Check if room was deleted (foreign key violation)
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23503') {
          setError('房间已被删除')
          onRoomDeleted?.()
          return
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, status: 'failed' as MessageStatus } : m
          )
        )
        setError('消息发送失败')
      }
    },
    [roomId, nickname, encryptionKey, saveToDB, encryptPayload, onRoomDeleted]
  )

  // Send image
  const sendImage = useCallback(
    async (file: File) => {
      if (!roomId || !encryptionKey) return

      const validation = validateImageFile(file)
      if (validation.error) {
        setError(validation.error)
        return
      }

      setSendingImage(true)
      setError(null)
      const msgId = crypto.randomUUID()
      let uploadData: Uint8Array | undefined

      try {
        const [dimensions, thumbnail] = await Promise.all([
          getImageDimensions(file),
          generateThumbnail(file),
        ])

        const fileData = await readFileAsArrayBuffer(file)
        const { ciphertext: encryptedData, iv: fileIv } = await encryptBuffer(fileData, encryptionKey)
        const fileKey = buildFileKey(roomId, msgId)

        // Prepend IV to encrypted data: [12 bytes IV][ciphertext...]
        uploadData = new Uint8Array(IV_LENGTH + encryptedData.length)
        uploadData.set(fileIv, 0)
        uploadData.set(encryptedData, IV_LENGTH)

        const fileMeta: FileMeta = {
          thumbnail,
          fileKey,
          fileName: file.name,
          fileSize: file.size,
          width: dimensions.width,
          height: dimensions.height,
          mimeType: file.type,
        }

        const fileMetaEncrypted = await encryptJSON(fileMeta, encryptionKey)
        const payload = await encryptPayload('📷 图片', nickname)

        const optimisticMsg: ChatMessage = {
          id: msgId,
          room_id: roomId,
          sender_nickname: '',
          msg_type: 'image',
          payload,
          file_meta_encrypted: fileMetaEncrypted,
          created_at: Date.now(),
          action: 'none',
          status: 'sending',
          _nick: nickname,
        }
        setMessages((prev) => [...prev, optimisticMsg])
        setImagePreview(null)

        // Save to DB first — if room is deleted, abort before uploading to Storage
        try {
          await saveToDB({ ...optimisticMsg, status: 'sent' })
        } catch (dbErr: unknown) {
          // Room deleted or other DB error — don't upload, don't save to IndexedDB
          throw dbErr
        }

        // Upload encrypted file to Storage only after DB save succeeds
        try {
          await uploadEncryptedFile(roomId, msgId, uploadData)
        } catch {
          // DB saved but upload failed — save to IndexedDB for retry
          if (uploadData) {
            try {
              await savePendingUpload({
                msgId,
                roomId,
                uploadData: uploadData.buffer.slice(0) as ArrayBuffer,
                createdAt: optimisticMsg.created_at,
              })
              console.log('[image] saved to IndexedDB for retry:', msgId)
            } catch { /* nothing more we can do */ }
          }
          throw new Error('UPLOAD_FAILED')
        }

        channelRef.current?.send({
          type: 'broadcast',
          event: 'message',
          payload: {
            type: 'message',
            sender_nickname: '',
            room_id: roomId,
            msg_type: 'image',
            payload,
            file_meta_encrypted: fileMetaEncrypted,
            message_id: msgId,
            timestamp: Date.now(),
          } satisfies BroadcastMessage,
        })

        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, status: 'sent' as MessageStatus } : m))
        )

      } catch (err: unknown) {
        console.error('Send image failed:', err)
        // Check if room was deleted (foreign key violation)
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23503') {
          setError('房间已被删除')
          onRoomDeleted?.()
          return
        }
        // Note: IndexedDB save is handled in the inner try-catch above
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, status: 'failed' as MessageStatus } : m
          )
        )
        if (err instanceof Error && err.message === 'UPLOAD_FAILED') {
          setError('图片发送失败，将在网络恢复后自动重传')
        } else {
          setError('图片发送失败')
        }
      } finally {
        setSendingImage(false)
      }
    },
    [roomId, nickname, encryptionKey, saveToDB, encryptPayload, onRoomDeleted]
  )

  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages

  // Retry failed message
  const retryMessage = useCallback(
    async (messageId: string) => {
      const msg = messagesRef.current.find((m) => m.id === messageId)
      if (!msg || msg.status !== 'failed') return

      if (msg.msg_type === 'text') {
        const plaintext = msg._plaintext || pendingRef.current.get(messageId)
        const nick = msg._nick || nickname
        if (!plaintext) return

        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, status: 'sending' as MessageStatus } : m
          )
        )

        try {
          if (!encryptionKey || !roomId) throw new Error('not ready')
          const payload = await encryptPayload(plaintext, nick)

          channelRef.current?.send({
            type: 'broadcast',
            event: 'message',
            payload: {
              type: 'message',
              sender_nickname: '',
              room_id: roomId,
              msg_type: 'text',
              payload,
              message_id: messageId,
              reply_to_id: msg.reply_to_id,
              timestamp: Date.now(),
            } satisfies BroadcastMessage,
          })
        } catch {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId ? { ...m, status: 'failed' as MessageStatus } : m
            )
          )
          setError('消息重发失败')
        }
      } else if (msg.msg_type === 'image') {
        // Retry image upload from IndexedDB
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, status: 'sending' as MessageStatus } : m
          )
        )

        try {
          if (!roomId) throw new Error('not ready')
          const pending = await getPendingUploads()
          const item = pending.find((p) => p.msgId === messageId)
          if (!item) {
            // No cached data — cannot retry
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId ? { ...m, status: 'failed' as MessageStatus } : m
              )
            )
            setError('图片重传失败：本地缓存已过期')
            return
          }

          await uploadEncryptedFile(item.roomId, item.msgId, new Uint8Array(item.uploadData))
          await removePendingUpload(item.msgId)

          // Update UI
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId ? { ...m, status: 'sent' as MessageStatus } : m
            )
          )

          // Broadcast so other tabs see it
          channelRef.current?.send({
            type: 'broadcast',
            event: 'message',
            payload: {
              type: 'message',
              sender_nickname: '',
              room_id: roomId,
              msg_type: 'image',
              payload: msg.payload,
              file_meta_encrypted: msg.file_meta_encrypted,
              message_id: messageId,
              timestamp: msg.created_at,
            } satisfies BroadcastMessage,
          })
        } catch {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId ? { ...m, status: 'failed' as MessageStatus } : m
            )
          )
          setError('图片重传失败')
        }
      }
    },
    [encryptionKey, roomId, nickname, encryptPayload]
  )

  // Revoke message
  const revokeMessage = useCallback(
    (messageId: string) => {
      if (!roomId) return

      // Clear any stale error (e.g. "消息发送失败") when user revokes
      setError(null)

      channelRef.current?.send({
        type: 'broadcast',
        event: 'message',
        payload: {
          type: 'revoke',
          sender_nickname: '',
          room_id: roomId,
          message_id: messageId,
          timestamp: Date.now(),
        } satisfies BroadcastMessage,
      })

      supabase
        .from('messages')
        .update({ action: 'revoke' })
        .eq('id', messageId)
        .then()
    },
    [roomId, nickname]
  )

  // Decrypt text and extract nickname from payload
  const getDecrypted = useCallback(
    async (msg: ChatMessage): Promise<string> => {
      if (msg.status === 'sending' && msg._plaintext) return msg._plaintext
      if (!encryptionKey) return '[加密中...]'
      if (!msg.payload.ciphertext && !msg.payload.iv) return '[发送中...]'
      try {
        const json = await decryptMessage(msg.payload, encryptionKey)
        try {
          const parsed = JSON.parse(json)
          // New format: {n: nickname, t: text}
          if (parsed.n && !msg._nick) {
            setMessages((prev) =>
              prev.map((m) => m.id === msg.id ? { ...m, _nick: parsed.n } : m)
            )
          }
          return parsed.t || json
        } catch {
          // Old format: plain text (backward compatible)
          return json
        }
      } catch {
        return '[解密失败 — 密码不匹配]'
      }
    },
    [encryptionKey]
  )

  // Decrypt file meta
  const getFileMeta = useCallback(
    async (msg: ChatMessage): Promise<FileMeta | null> => {
      if (!msg.file_meta_encrypted || !encryptionKey) return null
      try {
        return await decryptJSON<FileMeta>(msg.file_meta_encrypted, encryptionKey)
      } catch {
        return null
      }
    },
    [encryptionKey]
  )

  // Load original image: download → extract IV → decrypt → blob URL → cache
  const loadOriginalImage = useCallback(
    async (msg: ChatMessage): Promise<string | null> => {
      if (!encryptionKey) return null

      // Check cache
      const cached = imageCacheRef.current.get(msg.id)
      if (cached) return cached

      // Get file meta for fileKey and mimeType
      const meta = await getFileMeta(msg)
      if (!meta) return null

      try {
        // Download encrypted file (IV prepended)
        const rawData = await downloadEncryptedFile(meta.fileKey)

        // Extract IV and ciphertext
        const iv = rawData.slice(0, IV_LENGTH)
        const ciphertext = rawData.slice(IV_LENGTH)

        if (iv.length !== IV_LENGTH) return null

        // Decrypt
        const decrypted = await decryptBuffer(ciphertext, iv, encryptionKey)

        // Create blob URL
        const blob = new Blob([decrypted.buffer] as [ArrayBuffer], { type: meta.mimeType || 'image/jpeg' })
        const url = URL.createObjectURL(blob)

        // Cache
        imageCacheRef.current.set(msg.id, url)

        return url
      } catch (err) {
        console.error('Load original image failed:', err)
        return null
      }
    },
    [encryptionKey, getFileMeta]
  )

  // Image preview controls
  const clearImagePreview = useCallback(() => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview.preview)
    }
    setImagePreview(null)
  }, [imagePreview])

  const selectImage = useCallback((file: File) => {
    const validation = validateImageFile(file)
    if (validation.error) {
      setError(validation.error)
      return
    }
    const preview = URL.createObjectURL(file)
    setImagePreview({ file, preview })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      imageCacheRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  return {
    messages,
    error,
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
    setError,
    sendingImage,
    imagePreview,
    clearImagePreview,
    selectImage,
  }
}
