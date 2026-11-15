DROP TRIGGER IF EXISTS song_jobs_requeued ON song_job_outbox;
--> statement-breakpoint
DROP TRIGGER IF EXISTS song_jobs_ready ON song_job_outbox;
--> statement-breakpoint
CREATE TRIGGER song_jobs_ready AFTER INSERT OR UPDATE ON song_job_outbox
  FOR EACH ROW EXECUTE FUNCTION notify_song_jobs_ready();
