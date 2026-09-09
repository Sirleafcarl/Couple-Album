CREATE INDEX "photos_active_sort_index" ON "photos" USING btree ("sort_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "photos"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "photos_owner_active_sort_index" ON "photos" USING btree ("owner_id","sort_at" DESC NULLS FIRST,"id" DESC NULLS FIRST) WHERE "photos"."deleted_at" is null;
