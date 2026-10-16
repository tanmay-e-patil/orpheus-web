CREATE TABLE IF NOT EXISTS song_job_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id text NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('process-song-data', 'update-song-files', 'update-song-lyrics')),
  created_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_token uuid,
  lease_until timestamptz,
  published_at timestamptz,
  completed_at timestamptz,
  last_error text,
  trace_context jsonb NOT NULL DEFAULT '{}',
  CHECK ((lease_token IS NULL) = (lease_until IS NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS song_job_outbox_pending_idx
  ON song_job_outbox (available_at, created_at, id)
  WHERE published_at IS NULL AND completed_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS song_job_outbox_song_idx ON song_job_outbox (song_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS song_job_outbox_completed_idx ON song_job_outbox (completed_at)
  WHERE completed_at IS NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_song_jobs_ready() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('song_jobs_ready', '');
  RETURN NULL;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_jobs_ready ON song_job_outbox;
--> statement-breakpoint
CREATE TRIGGER song_jobs_ready AFTER INSERT OR UPDATE ON song_job_outbox
  FOR EACH ROW EXECUTE FUNCTION notify_song_jobs_ready();
