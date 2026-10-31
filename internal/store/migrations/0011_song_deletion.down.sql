-- Refuse rollback while tombstones exist: old workers could resurrect files.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM songs WHERE deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Cannot roll back song deletion while tombstones exist';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE song_job_outbox DROP CONSTRAINT song_job_outbox_action_check;
--> statement-breakpoint
ALTER TABLE song_job_outbox ADD CONSTRAINT song_job_outbox_action_check
  CHECK (action IN ('process-song-data', 'update-song-files', 'update-song-lyrics'));
--> statement-breakpoint
ALTER TABLE songs DROP COLUMN deleted_at;
