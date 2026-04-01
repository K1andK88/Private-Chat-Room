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

  // Create a new room in Supabase
  const createRoom = useCallback(async (name: string, _password: string): Promise<Room | null> => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('rooms')
        .insert({ name, created_by: nickname })
        .select()
        .single()

      if (error) {
        console.error('[createRoom] insert error:', error.code, error.message, 'name=', name)
        if (error.code === '23505') {
          const { data: existing } = await supabase
            .from('rooms')
            .select('*')
            .eq('name', name)
            .single()
          if (existing) {
            console.log('[createRoom] returning existing room:', existing.name, existing.id)
            return existing
          }
        }
        return null
      }

      console.log('[createRoom] created new room:', data.name, data.id)
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

  return { currentRoom, onlineUsers, loading, createRoom, joinRoom, leaveRoom }
}
