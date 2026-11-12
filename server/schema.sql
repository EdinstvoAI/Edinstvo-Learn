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
  start_day date,
  end_day date,
  time time NOT NULL,
  end_time time,
  movable boolean NOT NULL DEFAULT false,
  done boolean NOT NULL DEFAULT false
);

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS telegram_photo_url text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS telegram_username text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id uuid;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_day date;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS end_day date;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS end_time time;
UPDATE tasks SET start_day = COALESCE(start_day, day), end_day = COALESCE(end_day, day), end_time = COALESCE(end_time, time);

UPDATE accounts AS account
SET profile = jsonb_set(profile, '{projects}', (
  SELECT jsonb_agg(CASE WHEN item ? 'id' THEN item ELSE item || jsonb_build_object('id', gen_random_uuid()) END ORDER BY position)
  FROM jsonb_array_elements(account.profile->'projects') WITH ORDINALITY AS projects(item, position)
))
WHERE profile @? '$.projects[*] ? (!exists(@.id))';

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
