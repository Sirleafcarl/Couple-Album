CREATE TABLE "album_photos" (
	"album_id" uuid NOT NULL,
	"photo_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "albums" ADD COLUMN "wall_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "albums" ADD COLUMN "layout" text DEFAULT 'story' NOT NULL;--> statement-breakpoint
ALTER TABLE "albums" ADD COLUMN "manual_order" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "album_photos" ADD CONSTRAINT "album_photos_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_photos" ADD CONSTRAINT "album_photos_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "album_photos_membership_unique" ON "album_photos" USING btree ("album_id","photo_id");--> statement-breakpoint
CREATE INDEX "album_photos_position_index" ON "album_photos" USING btree ("album_id","position");--> statement-breakpoint
CREATE INDEX "album_photos_photo_index" ON "album_photos" USING btree ("photo_id");--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_wall_version_positive" CHECK ("albums"."wall_version" > 0);--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_layout_valid" CHECK ("albums"."layout" in ('story', 'garden', 'film'));