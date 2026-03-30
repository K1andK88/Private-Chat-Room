-- E2EE Chat Room Schema (Nickname mode - no auth required)
-- Server only stores CIPHERTEXT. Plaintext never touches the server.

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Online presence is handled entirely by Supabase Presence (client-side)
-- No room_members or user_public_keys tables needed
-- No Row Level Security needed since we don't use auth

-- Clean up old tables if they exist
DROP TABLE IF EXISTS user_public_keys;
DROP TABLE IF EXISTS room_members;
