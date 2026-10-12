CREATE TYPE "public"."actor_type" AS ENUM('editor', 'viewer', 'system');--> statement-breakpoint
CREATE TYPE "public"."grant_kind" AS ENUM('original', 'preview');--> statement-breakpoint
CREATE TYPE "public"."preview_mode" AS ENUM('first_n_seconds', 'custom_segment');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('uploading', 'uploaded', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."rendition_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."rendition_type" AS ENUM('preview_hls', 'preview_mp4', 'thumb_sprite');--> statement-breakpoint
CREATE TYPE "public"."share_link_status" AS ENUM('created', 'active', 'viewers_exhausted', 'expired', 'revoked', 'unlocked');--> statement-breakpoint
CREATE TYPE "public"."share_link_visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('active', 'completed', 'aborted');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"meta_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "download_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"kind" "grant_kind" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"status" "project_status" DEFAULT 'uploading' NOT NULL,
	"original_filename" text NOT NULL,
	"original_size" bigint NOT NULL,
	"duration_seconds" double precision,
	"width" integer,
	"height" integer,
	"drive_file_id" text,
	"drive_md5" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"type" "rendition_type" NOT NULL,
	"local_path" text NOT NULL,
	"duration" double precision,
	"status" "rendition_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"slug" varchar(64) NOT NULL,
	"client_label" text,
	"visibility" "share_link_visibility" DEFAULT 'private' NOT NULL,
	"passcode_hash" text,
	"preview_mode" "preview_mode" DEFAULT 'first_n_seconds' NOT NULL,
	"preview_start" double precision DEFAULT 0 NOT NULL,
	"preview_end" double precision,
	"max_viewers" integer DEFAULT 1 NOT NULL,
	"viewers_used" integer DEFAULT 0 NOT NULL,
	"allow_preview_download" boolean DEFAULT false NOT NULL,
	"watermark_text" text DEFAULT 'PREVIEW · NOT PAID' NOT NULL,
	"expires_at" timestamp with time zone,
	"status" "share_link_status" DEFAULT 'created' NOT NULL,
	"unlocked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "share_links_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"total_size" bigint NOT NULL,
	"chunk_size" integer DEFAULT 8388608 NOT NULL,
	"received_chunks_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "upload_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"storage_used_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "viewer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"ip_hash" varchar(64) NOT NULL,
	"ua_hash" varchar(64) NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "download_grants" ADD CONSTRAINT "download_grants_link_id_share_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."share_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renditions" ADD CONSTRAINT "renditions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "viewer_sessions" ADD CONSTRAINT "viewer_sessions_link_id_share_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."share_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "download_grants_token_hash_idx" ON "download_grants" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "download_grants_link_id_idx" ON "download_grants" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "renditions_project_version_idx" ON "renditions" USING btree ("project_id","version");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "share_links_slug_idx" ON "share_links" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "share_links_project_id_idx" ON "share_links" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "upload_sessions_project_id_idx" ON "upload_sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "viewer_sessions_link_id_idx" ON "viewer_sessions" USING btree ("link_id");