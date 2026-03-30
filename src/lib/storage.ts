import { supabase } from './supabase'

const BUCKET = 'chat-files'

/** Upload encrypted file to Supabase Storage */
export async function uploadEncryptedFile(
  roomId: string,
  messageId: string,
  data: Uint8Array
): Promise<string> {
  const fileKey = `${roomId}/${messageId}.bin`
  const blob = new Blob([data.buffer] as [ArrayBuffer], { type: 'application/octet-stream' })

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(fileKey, blob, {
      upsert: true,
      contentType: 'application/octet-stream',
    })

  if (error) throw new Error(`上传失败: ${error.message}`)

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileKey)
  return urlData.publicUrl
}

/** Download encrypted file from Supabase Storage */
export async function downloadEncryptedFile(fileKey: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(BUCKET).download(fileKey)

  if (error) throw new Error(`下载失败: ${error.message}`)
  return new Uint8Array(await data.arrayBuffer())
}

/** Delete file from Supabase Storage */
export async function deleteStorageFile(fileKey: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([fileKey])
}

/** Build storage file key */
export function buildFileKey(roomId: string, messageId: string): string {
  return `${roomId}/${messageId}.bin`
}
