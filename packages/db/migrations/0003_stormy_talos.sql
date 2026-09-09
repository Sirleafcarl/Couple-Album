CREATE TYPE "public"."album_theme_id" AS ENUM('secret-garden', 'love-letters', 'date-adventure');--> statement-breakpoint
CREATE TABLE "album_year_settings" (
	"year" integer PRIMARY KEY NOT NULL,
	"theme_id" "album_theme_id" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_year_settings_year_range" CHECK ("album_year_settings"."year" between 1000 and 9999),
	CONSTRAINT "album_year_settings_version_positive" CHECK ("album_year_settings"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"occurred_on" date NOT NULL,
	"created_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "albums_version_positive" CHECK ("albums"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "album_year_settings" ADD CONSTRAINT "album_year_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" ADD CONSTRAINT "albums_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "albums_active_occurred_index" ON "albums" USING btree ("occurred_on" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "albums"."deleted_at" is null;