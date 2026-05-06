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
  { id: 'bell', label: '铃声', src: '/sounds/bell.mp3' },
  { id: 'custom', label: '自定义', custom: true },
]

let currentAudio: HTMLAudioElement | null = null

/** Stop any currently playing preview/preview sound. */
export function stopCurrentSound(): void {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio = null
  }
}

/** Unlock browser Audio API by playing a silent buffer. */
let audioUnlocked = false
export function unlockAudio(): void {
  if (audioUnlocked) return
  try {
    const ctx = new AudioContext()
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => ctx.close())
    } else {
      const buf = ctx.createBuffer(1, 1, 22050)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      src.start(0)
      src.addEventListener('ended', () => ctx.close())
    }
    audioUnlocked = true
  } catch {
    // Silently fail — will retry next time since audioUnlocked stays false
  }
}

/** Callback type for when preview sound finishes playing. */
export type PreviewEndCallback = () => void

/**
 * Preview a sound (for the settings UI).
 * Returns true if playback succeeded, false if the format is unsupported.
 * onEnded is called when playback finishes naturally.
 */
export async function previewSound(soundId: string, volume: number, onEnded?: PreviewEndCallback): Promise<boolean> {
  // Stop any currently playing preview
  stopCurrentSound()

  if (soundId === 'system') {
    // Can't really preview system sound, just return true
    return true
  }

  const option = BUILT_IN_SOUNDS.find(s => s.id === soundId)
  if (!option) return false

  let objectUrl: string | undefined
  try {
    let audio: HTMLAudioElement

    if (option.custom) {
      const blob = await loadCustomSound()
      if (!blob) return false
      objectUrl = URL.createObjectURL(blob)
      audio = new Audio(objectUrl)
    } else if (option.src) {
      audio = new Audio(option.src)
    } else {
      return false
    }

    audio.volume = Math.max(0, Math.min(1, volume))
    currentAudio = audio
    try {
      await audio.play()
    } catch {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      currentAudio = null
      return false
    }
    // Revoke object URL and notify caller after playback ends
    if (objectUrl) audio.addEventListener('ended', () => URL.revokeObjectURL(objectUrl!))
    audio.addEventListener('ended', () => onEnded?.())
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
    return
  }

  const option = BUILT_IN_SOUNDS.find(s => s.id === soundId)
  if (!option) return

  let objectUrl: string | undefined
  try {
    let audio: HTMLAudioElement

    if (option.custom) {
      const blob = await loadCustomSound()
      if (!blob) return
      objectUrl = URL.createObjectURL(blob)
      audio = new Audio(objectUrl)
    } else if (option.src) {
      audio = new Audio(option.src)
    } else {
      return
    }

    audio.volume = Math.max(0, Math.min(1, volume))
    try {
      await audio.play()
    } catch {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      return
    }
    if (objectUrl) audio.addEventListener('ended', () => URL.revokeObjectURL(objectUrl!))
  } catch {
    // Silently fail
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
    req.onerror = () => { console.warn('[sound] IndexedDB open failed:', req.error); reject(req.error) }
  })
}

export async function saveCustomSound(file: File): Promise<void> {
  const buffer = await file.arrayBuffer()
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const record = { blob: buffer, name: file.name, type: file.type || 'audio/mpeg' }
    store.put(record, KEY)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
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
        if (!req.result) { db.close(); resolve(null); return }
        const record = req.result
        if (record.blob instanceof ArrayBuffer) {
          db.close()
          resolve(new Blob([record.blob], { type: record.type || 'audio/mpeg' }))
        } else {
          db.close()
          resolve(null)
        }
      }
      req.onerror = () => { db.close(); reject(req.error) }
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
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function hasCustomSound(): Promise<boolean> {
  const blob = await loadCustomSound()
  return blob !== null
}
