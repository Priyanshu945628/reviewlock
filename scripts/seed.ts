import dotenv from "dotenv";
dotenv.config();

import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import {
  users,
  projects,
  shareLinks,
  renditions,
  auditLog,
} from "../lib/db/schema";
import { hashPassword } from "../lib/auth/password";

async function seed() {
  console.log("================================================================================");
  console.log("ReviewLock Database Seeder (DESIGN §12 Realistic Sample Content)");
  console.log("================================================================================\n");

  const email = "priyanshu@example.com";
  const displayName = "Priyanshu";
  const password = "Password123!";

  console.log(`--> Checking / Creating editor user: ${email}...`);
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    const passwordHash = await hashPassword(password);
    const [created] = await db
      .insert(users)
      .values({
        email,
        displayName,
        passwordHash,
        storageUsedBytes: 8600000000, // ~8.6 GB
      })
      .returning();
    user = created;
    console.log(`✓ User created: ${user.id} (${email})`);
  } else {
    console.log(`✓ Existing user found: ${user.id}`);
  }

  // 1. Project 1: Wedding_Reel_v3.mp4 (4:12 = 252s, 2.9 GB)
  console.log("--> Seeding Project 1: Wedding_Reel_v3.mp4...");
  const [project1] = await db
    .insert(projects)
    .values({
      userId: user.id,
      title: "Wedding_Reel_v3.mp4",
      originalFilename: "Wedding_Reel_v3.mp4",
      originalSize: 2900000000,
      durationSeconds: 252,
      width: 1920,
      height: 1080,
      status: "ready",
      driveFileId: "drive_seed_wedding_reel_v3",
      driveMd5: "d41d8cd98f00b204e9800998ecf8427e",
    })
    .returning();

  // 2. Project 2: Brand_Promo_Final.mov (1:48 = 108s, 1.2 GB)
  console.log("--> Seeding Project 2: Brand_Promo_Final.mov...");
  const [project2] = await db
    .insert(projects)
    .values({
      userId: user.id,
      title: "Brand_Promo_Final.mov",
      originalFilename: "Brand_Promo_Final.mov",
      originalSize: 1200000000,
      durationSeconds: 108,
      width: 1920,
      height: 1080,
      status: "ready",
      driveFileId: "drive_seed_brand_promo_final",
      driveMd5: "0cc175b9c0f1b6a831c399e269772661",
    })
    .returning();

  // 3. Project 3: Podcast_Ep14_Cut.mp4 (38:05 = 2285s, 4.5 GB)
  console.log("--> Seeding Project 3: Podcast_Ep14_Cut.mp4...");
  const [project3] = await db
    .insert(projects)
    .values({
      userId: user.id,
      title: "Podcast_Ep14_Cut.mp4",
      originalFilename: "Podcast_Ep14_Cut.mp4",
      originalSize: 4500000000,
      durationSeconds: 2285,
      width: 1920,
      height: 1080,
      status: "ready",
      driveFileId: "drive_seed_podcast_ep14_cut",
      driveMd5: "92eb5ffee6ae2fec3ad71c777531578f",
    })
    .returning();

  // Share Link 1: Rahul – Wedding Reel (private, passcode: 123456, 30s preview)
  console.log("--> Seeding Share Link 1: Rahul – Wedding Reel...");
  const passcodeHash = await hashPassword("123456");
  const [link1] = await db
    .insert(shareLinks)
    .values({
      projectId: project1.id,
      slug: "x7Kq9Zr2",
      clientLabel: "Rahul – Wedding Reel",
      visibility: "private",
      passcodeHash,
      previewMode: "first_n_seconds",
      previewStart: 0,
      previewEnd: 30,
      maxViewers: 1,
      viewersUsed: 0,
      allowPreviewDownload: false,
      watermarkText: "PREVIEW · NOT PAID",
      status: "active",
    })
    .returning();

  // Share Link 2: Studio Kala – Promo (public, 45s preview)
  console.log("--> Seeding Share Link 2: Studio Kala – Promo...");
  const [link2] = await db
    .insert(shareLinks)
    .values({
      projectId: project2.id,
      slug: "k9Lm4Pq8",
      clientLabel: "Studio Kala – Promo",
      visibility: "public",
      previewMode: "first_n_seconds",
      previewStart: 0,
      previewEnd: 45,
      maxViewers: 2,
      viewersUsed: 1,
      allowPreviewDownload: true,
      watermarkText: "STUDIO KALA · PREVIEW",
      status: "active",
    })
    .returning();

  // Renditions
  console.log("--> Seeding Renditions...");
  await db.insert(renditions).values([
    {
      projectId: project1.id,
      version: 1,
      type: "preview_hls",
      localPath: `/data/renditions/${project1.id}/v1/preview.m3u8`,
      duration: 30,
      status: "ready",
    },
    {
      projectId: project1.id,
      version: 1,
      type: "thumb_sprite",
      localPath: `/data/thumbs/${project1.id}/sprite.webp`,
      duration: 252,
      status: "ready",
    },
  ]);

  // Audit Logs
  console.log("--> Seeding Audit Log...");
  await db.insert(auditLog).values([
    {
      actorType: "editor",
      actorId: user.id,
      entity: "share_link",
      entityId: link1.id,
      action: "created",
      metaJson: { slug: link1.slug, clientLabel: link1.clientLabel },
    },
    {
      actorType: "editor",
      actorId: user.id,
      entity: "share_link",
      entityId: link2.id,
      action: "created",
      metaJson: { slug: link2.slug, clientLabel: link2.clientLabel },
    },
  ]);

  console.log(`
================================================================================
SEED COMPLETE!
--------------------------------------------------------------------------------
Editor Account:  ${email}
Password:        ${password}
Projects:        3 ready (Wedding Reel 4:12, Brand Promo 1:48, Podcast 38:05)
Share Links:     2 active ("x7Kq9Zr2" - Rahul, "k9Lm4Pq8" - Studio Kala)
================================================================================
`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  });
