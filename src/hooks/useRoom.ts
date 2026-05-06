import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Room, PresenceUser } from '../lib/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useRoom(nickname: string) {
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])
  const [loading, setLoading] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const userIdRef = useRef(`user:${nickname}:${crypto.randomUUID()}`)
  const lastSyncTimeRef = useRef(Date.now())
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
      lastSyncTimeRef.current = Date.now()
      const state = roomChannel.presenceState<{ id: string; nickname: string; joined_at: number }>()
      setOnlineUsers(Object.values(state).map((p) => p[0]))
    })

    roomChannel.subscribe(async (status) => {
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
      lastSyncTimeRef.current = Date.now()
      const state = roomChannel.presenceState<{ id: string; nickname: string; joined_at: number }>()
      const users = Object.values(state).map((p) => p[0])
      setOnlineUsers(users.length > 0 ? users : onlineUsersRef.current) // keep existing if no one visible
    })

    roomChannel.subscribe(async (status) => {
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

  // Leave room entirely
  const leaveRoom = useCallback(async () => {
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
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

  return { currentRoom, onlineUsers, loading, createRoom, joinRoom, leaveRoom, lastSyncTimeRef, reconnectPresence }
}
