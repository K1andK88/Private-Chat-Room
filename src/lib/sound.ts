/**
 * Sound playback utilities for notification sounds.
 * Uses Web Audio / HTMLAudioElement for reliable cross-platform playback.
 */

export interface SoundOption {
  id: string
  label: string
  src?: string // URL for built-in sounds (e.g. /sounds/ding.mp3)
  custom?: boolean // true = loaded from IndexedDB
}

export const BUILT_IN_SOUNDS: SoundOption[] = [
  { id: 'system', label: '系统默认' },
  { id: 'ding', label: '叮', src: '/sounds/ding.mp3' },
  { id: 'bell', label: '铃声', src: '/sounds/bell.mp3' },
  { id: 'bubble', label: '气泡', src: '/sounds/bubble.mp3' },
  { id: 'synth', label: '合成', src: '/sounds/synth.mp3' },
  { id: 'marimba', label: '木琴', src: '/sounds/marimba.mp3' },
  { id: 'custom', label: '自定义', custom: true },
]

let currentAudio: HTMLAudioElement | null = null

/**
 * Preview a sound (for the settings UI).
 * Returns true if playback succeeded, false if the format is unsupported.
 */
export async function previewSound(soundId: string, volume: number): Promise<boolean> {
  // Stop any currently playing preview
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }

  if (soundId === 'system') {
    // Can't really preview system sound, just return true
    return true
  }

  const option = BUILT_IN_SOUNDS.find(s => s.id === soundId)
  if (!option) return false

  try {
    let audio: HTMLAudioElement

    if (option.custom) {
      const blob = await loadCustomSound()
      if (!blob) return false
      audio = new Audio(URL.createObjectURL(blob))
      audio.addEventListener('ended', () => URL.revokeObjectURL(audio.src))
    } else if (option.src) {
      audio = new Audio(option.src)
    } else {
      return false
    }

    audio.volume = Math.max(0, Math.min(1, volume))
    currentAudio = audio
    await audio.play()
    return true
  } catch {
    return false
  }
}

/**
 * Play the configured notification sound.
 * Called when a new message arrives while the page is hidden.
 */
export async function playNotificationSound(
  soundId: string,
  volume: number,
): Promise<void> {
  if (soundId === 'system') {
    // System sound is handled by Notification API (silent: false)
    return
  }

  const option = BUILT_IN_SOUNDS.find(s => s.id === soundId)
  if (!option) return

  try {
    let audio: HTMLAudioElement

    if (option.custom) {
      const blob = await loadCustomSound()
      if (!blob) return
      audio = new Audio(URL.createObjectURL(blob))
      audio.addEventListener('ended', () => URL.revokeObjectURL(audio.src))
    } else if (option.src) {
      audio = new Audio(option.src)
    } else {
      return
    }

    audio.volume = Math.max(0, Math.min(1, volume))
    await audio.play()
  } catch {
    // Silently fail — notification sound is best-effort
  }
}

// ── IndexedDB for custom sound ──

const DB_NAME = 'pcr-custom-sound'
const DB_VERSION = 1
const STORE_NAME = 'sounds'
const KEY = 'custom-sound'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveCustomSound(file: File): Promise<void> {
  const buffer = await file.arrayBuffer()
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    // Store as { blob, name, type }
    const record = { blob: buffer, name: file.name, type: file.type || 'audio/mpeg' }
    store.put(record, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadCustomSound(): Promise<Blob | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(KEY)
      req.onsuccess = () => {
        if (!req.result) { resolve(null); return }
        const record = req.result
        if (record.blob instanceof ArrayBuffer) {
          resolve(new Blob([record.blob], { type: record.type || 'audio/mpeg' }))
        } else {
          resolve(null)
        }
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function removeCustomSound(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function hasCustomSound(): Promise<boolean> {
  const blob = await loadCustomSound()
  return blob !== null
}
