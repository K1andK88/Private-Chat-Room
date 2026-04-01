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
import type {
  ChatMessage, BroadcastMessage, MessageAction, MessageStatus,
  MessageType, FileMeta, EncryptedPayload,
} from '../lib/types'
import { MESSAGE_TTL_MS, HISTORY_LIMIT } from '../lib/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

const IV_LENGTH = 12

export function useMessages(
  roomId: string | null,
  roomPassword: string,
  nickname: string
) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [sendingImage, setSendingImage] = useState(false)
  const [imagePreview, setImagePreview] = useState<{ file: File; preview: string } | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const cleanupRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingRef = useRef<Map<string, string>>(new Map())
  const imageCacheRef = useRef<Map<string, string>>(new Map())
  const unreadRef = useRef(0)
  const flashRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const originalTitleRef = useRef(document.title)

  // Tab flash when page is hidden and new message arrives
  const bumpUnread = useCallback(() => {
    // Taskbar flash feature shelved — kept as stub for future use
  }, [])

  // Stop flashing when page becomes visible
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) {
        unreadRef.current = 0
        if (flashRef.current) {
          clearInterval(flashRef.current)
          flashRef.current = null
        }
        document.title = originalTitleRef.current
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
        bumpUnread()
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
    try {
      await supabase.from('messages').insert({
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
    } catch (err) {
      console.error('Save to DB failed:', err)
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
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, status: 'failed' as MessageStatus } : m
          )
        )
        setError('消息发送失败')
      }
    },
    [roomId, nickname, encryptionKey, saveToDB, encryptPayload]
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

      try {
        const [dimensions, thumbnail] = await Promise.all([
          getImageDimensions(file),
          generateThumbnail(file),
        ])

        const fileData = await readFileAsArrayBuffer(file)
        const { ciphertext: encryptedData, iv: fileIv } = await encryptBuffer(fileData, encryptionKey)
        const fileKey = buildFileKey(roomId, msgId)

        // Prepend IV to encrypted data: [12 bytes IV][ciphertext...]
        const uploadData = new Uint8Array(IV_LENGTH + encryptedData.length)
        uploadData.set(fileIv, 0)
        uploadData.set(encryptedData, IV_LENGTH)

        await uploadEncryptedFile(roomId, msgId, uploadData)

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

        // Save to DB first, then broadcast
        await saveToDB({ ...optimisticMsg, status: 'sent' })

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

      } catch (err) {
        console.error('Send image failed:', err)
        setError('图片发送失败')
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, status: 'failed' as MessageStatus } : m
          )
        )
      } finally {
        setSendingImage(false)
      }
    },
    [roomId, nickname, encryptionKey, saveToDB, encryptPayload]
  )

  // Retry failed message
  const retryMessage = useCallback(
    async (messageId: string) => {
      const msg = messages.find((m) => m.id === messageId)
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
      }
    },
    [messages, encryptionKey, roomId, nickname, encryptPayload]
  )

  // Revoke message
  const revokeMessage = useCallback(
    (messageId: string) => {
      if (!roomId) return

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
