CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('mentor', 'mentee')),
  name text NOT NULL,
  telegram_id text UNIQUE,
  mentor_id uuid REFERENCES accounts(id),
  profile jsonb NOT NULL DEFAULT '{}',
  CHECK ((role = 'mentor') = (mentor_id IS NULL))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS access_granted_at timestamptz;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS access_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS access_retry_at timestamptz;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS local_id text UNIQUE;

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title text NOT NULL,
  day date NOT NULL,
  time time NOT NULL,
  movable boolean NOT NULL DEFAULT false,
  done boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  mime text NOT NULL,
  contents bytea NOT NULL,
  caption text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounts_mentor_idx ON accounts (mentor_id);
CREATE INDEX IF NOT EXISTS tasks_person_day_idx ON tasks (person, day, time);
CREATE INDEX IF NOT EXISTS photos_person_date_idx ON photos (person, created_at DESC);
