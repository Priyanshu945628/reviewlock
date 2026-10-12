import {
  pgTable,
  uuid,
  varchar,
  text,
  bigint,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Enums conforming to CONTRACT §5, §6, §7
export const projectStatusEnum = pgEnum("project_status", [
  "uploading",
  "uploaded",
  "processing",
  "ready",
  "failed",
]);

export const uploadStatusEnum = pgEnum("upload_status", [
  "active",
  "completed",
  "aborted",
]);

export const renditionTypeEnum = pgEnum("rendition_type", [
  "preview_hls",
  "preview_mp4",
  "thumb_sprite",
]);

export const renditionStatusEnum = pgEnum("rendition_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

export const shareLinkVisibilityEnum = pgEnum("share_link_visibility", [
  "public",
  "private",
]);

export const previewModeEnum = pgEnum("preview_mode", [
  "first_n_seconds",
  "custom_segment",
]);

export const shareLinkStatusEnum = pgEnum("share_link_status", [
  "created",
  "active",
  "viewers_exhausted",
  "expired",
  "revoked",
  "unlocked",
]);

export const grantKindEnum = pgEnum("grant_kind", [
  "original",
  "preview",
]);

export const actorTypeEnum = pgEnum("actor_type", [
  "editor",
  "viewer",
  "system",
]);

// 1. users: id, email, password_hash, display_name, storage_used_bytes, created_at
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    storageUsedBytes: bigint("storage_used_bytes", { mode: "number" })
      .default(0)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    emailIdx: index("users_email_idx").on(table.email),
  })
);

// 2. sessions: id, user_id, expires_at, created_at
export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdIdx: index("sessions_user_id_idx").on(table.userId),
    expiresAtIdx: index("sessions_expires_at_idx").on(table.expiresAt),
  })
);

// 3. projects: id, user_id, title, status, original_filename, original_size, duration_seconds, width, height, drive_file_id, drive_md5, created_at
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    status: projectStatusEnum("status").default("uploading").notNull(),
    originalFilename: text("original_filename").notNull(),
    originalSize: bigint("original_size", { mode: "number" }).notNull(),
    durationSeconds: doublePrecision("duration_seconds"),
    width: integer("width"),
    height: integer("height"),
    driveFileId: text("drive_file_id"),
    driveMd5: text("drive_md5"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdIdx: index("projects_user_id_idx").on(table.userId),
  })
);

// 4. upload_sessions: id, project_id, total_size, chunk_size, received_chunks_json, status, created_at
export const uploadSessions = pgTable(
  "upload_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    totalSize: bigint("total_size", { mode: "number" }).notNull(),
    chunkSize: integer("chunk_size").default(8388608).notNull(), // 8 MiB default
    receivedChunksJson: jsonb("received_chunks_json").default(sql`'[]'::jsonb`).notNull(),
    status: uploadStatusEnum("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    projectIdIdx: index("upload_sessions_project_id_idx").on(table.projectId),
  })
);

// 5. renditions: id, project_id, version, type, local_path, duration, status, created_at
export const renditions = pgTable(
  "renditions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    version: integer("version").default(1).notNull(),
    type: renditionTypeEnum("type").notNull(),
    localPath: text("local_path").notNull(),
    duration: doublePrecision("duration"),
    status: renditionStatusEnum("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    projectVersionIdx: index("renditions_project_version_idx").on(
      table.projectId,
      table.version
    ),
  })
);

// 6. share_links: id, project_id, slug, client_label, visibility, passcode_hash, preview_mode, preview_start, preview_end, max_viewers, viewers_used, allow_preview_download, watermark_text, expires_at, status, unlocked_at, created_at
export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    clientLabel: text("client_label"),
    visibility: shareLinkVisibilityEnum("visibility").default("private").notNull(),
    passcodeHash: text("passcode_hash"),
    previewMode: previewModeEnum("preview_mode").default("first_n_seconds").notNull(),
    previewStart: doublePrecision("preview_start").default(0).notNull(),
    previewEnd: doublePrecision("preview_end"),
    maxViewers: integer("max_viewers").default(1).notNull(),
    viewersUsed: integer("viewers_used").default(0).notNull(),
    allowPreviewDownload: boolean("allow_preview_download").default(false).notNull(),
    watermarkText: text("watermark_text").default("PREVIEW · NOT PAID").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: shareLinkStatusEnum("status").default("created").notNull(),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    slugIdx: index("share_links_slug_idx").on(table.slug),
    projectIdIdx: index("share_links_project_id_idx").on(table.projectId),
  })
);

// 7. viewer_sessions: id, link_id, ip_hash, ua_hash, first_seen, last_seen
export const viewerSessions = pgTable(
  "viewer_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    linkId: uuid("link_id")
      .references(() => shareLinks.id, { onDelete: "cascade" })
      .notNull(),
    ipHash: varchar("ip_hash", { length: 64 }).notNull(),
    uaHash: varchar("ua_hash", { length: 64 }).notNull(),
    firstSeen: timestamp("first_seen", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    linkIdIdx: index("viewer_sessions_link_id_idx").on(table.linkId),
  })
);

// 8. download_grants: id, link_id, token_hash, expires_at, used_at, kind
export const downloadGrants = pgTable(
  "download_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    linkId: uuid("link_id")
      .references(() => shareLinks.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    kind: grantKindEnum("kind").notNull(),
  },
  (table) => ({
    tokenHashIdx: index("download_grants_token_hash_idx").on(table.tokenHash),
    linkIdIdx: index("download_grants_link_id_idx").on(table.linkId),
  })
);

// 9. audit_log: id, actor_type, actor_id, entity, entity_id, action, meta_json, created_at
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id"),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    metaJson: jsonb("meta_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    entityIdx: index("audit_log_entity_idx").on(table.entity, table.entityId),
    createdAtIdx: index("audit_log_created_at_idx").on(table.createdAt),
  })
);
