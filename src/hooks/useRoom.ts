import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Room, PresenceUser } from '../lib/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useRoom(nickname: string) {
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])
  const [loading, setLoading] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const userIdRef = useRef(crypto.randomUUID())
  const presenceStatusRef = useRef<string>('idle')
  const reconnectInFlightRef = useRef(false)
  const currentRoomRef = useRef<Room | null>(null)
  useEffect(() => { currentRoomRef.current = currentRoom }, [currentRoom])
  const onlineUsersRef = useRef<PresenceUser[]>([])
  useEffect(() => { onlineUsersRef.current = onlineUsers }, [onlineUsers])

  // Create a new room in Supabase
  const createRoom = useCallback(async (name: string): Promise<Room | null> => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('rooms')
        .insert({ name, created_by: nickname })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          throw new Error('ROOM_EXISTS')
        }
        return null
      }

      return data
    } finally {
      setLoading(false)
    }
  }, [nickname])

  // Join a room (get from DB + subscribe)
  const joinRoom = useCallback(async (room: Room) => {
    // Leave previous
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    setCurrentRoom(room)

    const roomChannel = supabase.channel(`room:${room.id}`, {
      config: { broadcast: { self: true } },
    })

    roomChannel.on('presence', { event: 'sync' }, () => {
      const state = roomChannel.presenceState<{ id: string; nickname: string; joined_at: number }>()
      const seen = new Map<string, { id: string; nickname: string; joined_at: number }>()
      for (const entries of Object.values(state)) {
        for (const entry of entries) {
          const existing = seen.get(entry.nickname)
          if (!existing || entry.joined_at > existing.joined_at) {
            seen.set(entry.nickname, entry)
          }
        }
      }
      setOnlineUsers(Array.from(seen.values()))
    })

    roomChannel.subscribe(async (status) => {
      presenceStatusRef.current = status
      if (status === 'SUBSCRIBED') {
        await roomChannel.track({
          id: userIdRef.current,
          nickname,
          joined_at: Date.now(),
        })
      }
    })

    channelRef.current = roomChannel
  }, [nickname])

  // Rebuild presence channel (without leaving the room)
  const reconnectPresence = useCallback(async () => {
    // Guard against concurrent rebuilds (watchdog + focus check can overlap)
    if (reconnectInFlightRef.current) return
    reconnectInFlightRef.current = true

    try {
      const room = currentRoomRef.current
      if (!room) return

      if (channelRef.current) {
        await supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }

      const roomChannel = supabase.channel(`room:${room.id}`, {
        config: { broadcast: { self: true } },
      })

      roomChannel.on('presence', { event: 'sync' }, () => {
        const state = roomChannel.presenceState<{ id: string; nickname: string; joined_at: number }>()
        // Deduplicate by nickname: keep the latest entry per user
        const seen = new Map<string, { id: string; nickname: string; joined_at: number }>()
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            const existing = seen.get(entry.nickname)
            if (!existing || entry.joined_at > existing.joined_at) {
              seen.set(entry.nickname, entry)
            }
          }
        }
        const users = Array.from(seen.values())
        setOnlineUsers(users.length > 0 ? users : onlineUsersRef.current)
      })

      roomChannel.subscribe(async (status) => {
        presenceStatusRef.current = status
        if (status === 'SUBSCRIBED') {
          await roomChannel.track({
            id: userIdRef.current,
            nickname,
            joined_at: Date.now(),
          })
        }
      })

      channelRef.current = roomChannel
    } finally {
      reconnectInFlightRef.current = false
    }
  }, [nickname])

  // Leave room entirely
  const leaveRoom = useCallback(async () => {
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    presenceStatusRef.current = 'idle'
    setCurrentRoom(null)
    setOnlineUsers([])
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [])

  return { currentRoom, onlineUsers, loading, createRoom, joinRoom, leaveRoom, presenceStatusRef, reconnectPresence }
}
