-- The dispatcher recomputes its deadline after every drain, so its own claim,
-- publish, and retry updates need no wake-up. New jobs and operator requeues
-- (published_at reset to NULL, see docs/operations.md) do.
DROP TRIGGER IF EXISTS song_jobs_ready ON song_job_outbox;
--> statement-breakpoint
CREATE TRIGGER song_jobs_ready AFTER INSERT ON song_job_outbox
  FOR EACH ROW EXECUTE FUNCTION notify_song_jobs_ready();
--> statement-breakpoint
CREATE TRIGGER song_jobs_requeued AFTER UPDATE OF published_at ON song_job_outbox
  FOR EACH ROW
  WHEN (OLD.published_at IS NOT NULL AND NEW.published_at IS NULL AND NEW.completed_at IS NULL)
  EXECUTE FUNCTION notify_song_jobs_ready();
