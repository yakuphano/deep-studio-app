-- Support admin lookup: allows app to resolve admin UUID by email
CREATE TABLE IF NOT EXISTS support_admin (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL
);

-- Populate from auth.users (run once after admin signs up)
INSERT INTO support_admin (id, email)
SELECT id, email FROM auth.users WHERE email = 'yakup.hano@deepannotation.ai' LIMIT 1
ON CONFLICT (email) DO NOTHING;

-- RLS: allow authenticated users to read
ALTER TABLE support_admin ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read support_admin" ON support_admin FOR SELECT TO authenticated USING (true);
