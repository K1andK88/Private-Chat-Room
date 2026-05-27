import { THUMBNAIL_MAX_WIDTH, THUMBNAIL_QUALITY, MAX_IMAGE_SIZE } from './types'

interface ImageDimensions {
  width: number
  height: number
}

/** Validate and read an image file */
export function validateImageFile(file: File): { error?: string } {
  if (!file.type.startsWith('image/')) {
    return { error: '仅支持图片文件' }
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return { error: `图片大小不能超过 ${MAX_IMAGE_SIZE / 1024 / 1024}MB` }
  }
  return {}
}

/** Get image dimensions */
export function getImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      reject(new Error('无法读取图片'))
    }
    img.src = URL.createObjectURL(file)
  })
}

/** Generate a compressed thumbnail as base64 data URL */
export function generateThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')

      const ratio = Math.min(THUMBNAIL_MAX_WIDTH / img.naturalWidth, 1)
      canvas.width = Math.round(img.naturalWidth * ratio)
      canvas.height = Math.round(img.naturalHeight * ratio)

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 不支持'))
        return
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY)
      URL.revokeObjectURL(img.src)
      resolve(dataUrl)
    }
    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      reject(new Error('缩略图生成失败'))
    }
    img.src = URL.createObjectURL(file)
  })
}

/** Read file as ArrayBuffer */
export function readFileAsArrayBuffer(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsArrayBuffer(file)
  })
}

/** Format file size for display */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}
