ALTER TABLE songs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
--> statement-breakpoint
ALTER TABLE song_job_outbox DROP CONSTRAINT song_job_outbox_action_check;
--> statement-breakpoint
ALTER TABLE song_job_outbox ADD CONSTRAINT song_job_outbox_action_check
  CHECK (action IN ('process-song-data', 'update-song-files', 'update-song-lyrics', 'delete-song-files'));
