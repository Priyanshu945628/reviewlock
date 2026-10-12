// Chunk F2 Verification: Typed API Client & Mock Data Contract Compliance

import assert from "node:assert";
import { api } from "../lib/api";
import { MOCK_USER, MOCK_PROJECTS, MOCK_SHARE_LINKS } from "../lib/mocks/data";

async function runF2Tests() {
  console.log("================================================================================");
  console.log("ReviewLock Typed API Client & Mocks Verification Suite (CHUNK F2)");
  console.log("================================================================================");

  // Force mock mode
  process.env.NEXT_PUBLIC_USE_MOCKS = "true";

  console.log("\n--> 1. Testing api.auth.me (Mock user retrieval)...");
  const meRes = await api.auth.me();
  assert.strictEqual(meRes.ok, true, "api.auth.me must succeed in mock mode");
  assert.strictEqual(meRes.data?.user.displayName, MOCK_USER.displayName);
  assert.strictEqual(meRes.data?.user.email, MOCK_USER.email);
  console.log("✓ api.auth.me returned expected mock user:", meRes.data?.user.displayName);

  console.log("\n--> 2. Testing api.storage.getStorageQuota...");
  const storageRes = await api.storage.getStorageQuota();
  assert.strictEqual(storageRes.ok, true);
  assert.strictEqual(storageRes.data?.usedBytes, MOCK_USER.storageUsedBytes);
  assert.strictEqual(storageRes.data?.limitBytes, MOCK_USER.storageLimitBytes);
  console.log(`✓ api.storage returned ${storageRes.data?.usedBytes} bytes of ${storageRes.data?.limitBytes} bytes`);

  console.log("\n--> 3. Testing api.projects.list (all, filtered, searched)...");
  const allProjects = await api.projects.list();
  assert.strictEqual(allProjects.ok, true);
  assert.strictEqual(allProjects.data?.projects.length, MOCK_PROJECTS.length);
  console.log(`✓ api.projects.list returned all ${allProjects.data?.projects.length} mock projects`);

  const readyProjects = await api.projects.list({ status: "ready" });
  assert.strictEqual(readyProjects.ok, true);
  assert.strictEqual(readyProjects.data?.projects.every((p) => p.status === "ready"), true);
  console.log(`✓ Filtered status=ready returned ${readyProjects.data?.projects.length} projects`);

  const searched = await api.projects.list({ search: "Wedding" });
  assert.strictEqual(searched.ok, true);
  assert.strictEqual(searched.data?.projects.length, 1);
  assert.strictEqual(searched.data?.projects[0].title, "Wedding_Reel_v3.mp4");
  console.log("✓ Search query 'Wedding' correctly found Wedding_Reel_v3.mp4");

  console.log("\n--> 4. Testing api.projects.get & rename...");
  const singleProj = await api.projects.get("proj_wedding_reel");
  assert.strictEqual(singleProj.ok, true);
  assert.strictEqual(singleProj.data?.project.id, "proj_wedding_reel");

  const renameRes = await api.projects.rename("proj_wedding_reel", "Wedding_Reel_v4.mp4");
  assert.strictEqual(renameRes.ok, true);
  assert.strictEqual(renameRes.data?.project.title, "Wedding_Reel_v4.mp4");
  console.log("✓ Project rename mock returned updated project title");

  console.log("\n--> 5. Testing api.links.listByProject & create...");
  const links = await api.links.listByProject("proj_wedding_reel");
  assert.strictEqual(links.ok, true);
  assert.strictEqual(links.data?.links.length >= 1, true);
  console.log(`✓ Links for proj_wedding_reel returned ${links.data?.links.length} links`);

  const createLinkRes = await api.links.create("proj_wedding_reel", {
    clientLabel: "Test Client",
    previewStart: 0,
    previewEnd: 45,
  });
  assert.strictEqual(createLinkRes.ok, true);
  assert.strictEqual(createLinkRes.data?.link.clientLabel, "Test Client");
  assert.strictEqual(createLinkRes.data?.link.previewEnd, 45);
  console.log("✓ api.links.create created link with slug:", createLinkRes.data?.link.slug);

  console.log("\n================================================================================");
  console.log("ALL F2 TYPED API CLIENT & MOCK TESTS PASSED!");
  console.log("================================================================================");
}

runF2Tests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
