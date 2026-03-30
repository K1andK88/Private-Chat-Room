-- ============================================
-- Private Chat Room - Migration v2
-- 消息持久化 + 图片存储支持
-- ============================================

-- 1. 创建 messages 表
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_nickname TEXT NOT NULL,
  msg_type TEXT NOT NULL DEFAULT 'text',
  payload JSONB NOT NULL DEFAULT '{"ciphertext":"","iv":""}',
  file_meta_encrypted JSONB,
  reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  action TEXT NOT NULL DEFAULT 'none',
  revoked_by TEXT,
  created_at BIGINT NOT NULL
);

-- 消息查询索引
CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at);

-- 禁用 RLS（无认证系统）
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "messages_allow_all" ON messages FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. 创建 Storage Bucket（存放加密文件）
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-files', 'chat-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage 策略（允许所有操作 - 无认证）
DO $$ BEGIN
  CREATE POLICY "chat_files_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-files');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "chat_files_read" ON storage.objects FOR SELECT USING (bucket_id = 'chat-files');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "chat_files_delete" ON storage.objects FOR DELETE USING (bucket_id = 'chat-files');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 完成！
-- 验证: SELECT * FROM messages LIMIT 0; SELECT * FROM storage.buckets WHERE id = 'chat-files';
