export interface Room {
  id: string
  name: string
  created_by: string
  created_at: string
}

export interface EncryptedPayload {
  ciphertext: string
  iv: string
}

export type MessageAction = 'none' | 'revoke'
export type MessageStatus = 'sending' | 'sent' | 'failed'
export type MessageType = 'text' | 'image' | 'file'

export interface FileMeta {
  thumbnail: string   // base64 data URL (encrypted when stored)
  fileKey: string     // Storage path: {roomId}/{messageId}.bin
  fileName: string
  fileSize: number
  width?: number
  height?: number
  mimeType: string
}

export interface ChatMessage {
  id: string
  room_id: string
  sender_nickname: string
  msg_type: MessageType
  payload: EncryptedPayload
  file_meta_encrypted?: EncryptedPayload
  created_at: number
  action: MessageAction
  reply_to_id?: string
  revoked_by?: string
  status?: MessageStatus
  _plaintext?: string
  _nick?: string
}

export interface BroadcastMessage {
  type: 'message' | 'revoke'
  sender_nickname: string
  room_id: string
  msg_type?: MessageType
  payload?: EncryptedPayload
  file_meta_encrypted?: EncryptedPayload
  message_id?: string
  reply_to_id?: string
  timestamp: number
}

export interface PresenceUser {
  id: string
  nickname: string
  joined_at: number
}

export const MESSAGE_TTL_MS = (parseInt(import.meta.env.VITE_MESSAGE_TTL) || 10) * 60 * 1000
export const REVOKE_WINDOW_MS = (parseInt(import.meta.env.VITE_REVOKE_WINDOW) || 2) * 60 * 1000
export const FILE_EXPIRE_MS = 24 * 60 * 60 * 1000
export const MAX_IMAGE_SIZE = 20 * 1024 * 1024
export const THUMBNAIL_MAX_WIDTH = 300
export const THUMBNAIL_QUALITY = 0.6
export const HISTORY_LIMIT = 100
