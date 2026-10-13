import dotenv from "dotenv";
dotenv.config();

import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { users } from "../lib/db/schema";
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
        storageUsedBytes: 0,
      })
      .returning();
    user = created;
    console.log(`✓ User created: ${user.id} (${email}) with 0 bytes used.`);
  } else {
    // Reset storage used to 0 if needed
    await db.update(users).set({ storageUsedBytes: 0 }).where(eq(users.id, user.id));
    console.log(`✓ Existing user found: ${user.id} (storage reset to 0 bytes)`);
  }

  console.log(`
================================================================================
SEED COMPLETE (CLEAN SLATE)!
--------------------------------------------------------------------------------
Editor Account:  ${email}
Password:        ${password}
Storage:         0 B used (ready for real uploads)
Projects:        0 (pristine)
================================================================================
`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  });
