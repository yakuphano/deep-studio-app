-- Support chat messages: user <-> admin
-- receiver_id = 'admin' when user sends to support; receiver_id = user uuid when admin replies
DROP TABLE IF EXISTS messages CASCADE;
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id text NOT NULL,
  receiver_id text NOT NULL,
  content text NOT NULL DEFAULT '',
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_messages_receiver ON messages(receiver_id);
CREATE INDEX idx_messages_created ON messages(created_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Users can read messages where they are sender or receiver
CREATE POLICY "Users can read own messages" ON messages
  FOR SELECT USING (
    auth.uid()::text = sender_id OR auth.uid()::text = receiver_id
  );

CREATE POLICY "Users can insert own messages" ON messages
  FOR INSERT WITH CHECK (auth.uid()::text = sender_id);

-- Users can mark as read only messages they received
CREATE POLICY "Users can update received messages" ON messages
  FOR UPDATE USING (auth.uid()::text = receiver_id);

-- Enable Realtime for new messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
