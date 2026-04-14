CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "artist_name_idx" ON "songs" USING btree ("artist_name");--> statement-breakpoint
CREATE INDEX "yt_video_id_idx" ON "songs" USING btree ("yt_video_id");