import assert from "node:assert";
import { formatTimecode, formatBytes, formatRelative } from "../lib/format";

console.log("================================================================================");
console.log("Running lib/format.ts Unit Tests (CHUNK F1)");
console.log("================================================================================\n");

// 1. Timecode formatting tests
console.log("--> Testing formatTimecode...");
assert.strictEqual(formatTimecode(0), "0:00");
assert.strictEqual(formatTimecode(7), "0:07");
assert.strictEqual(formatTimecode(30), "0:30");
assert.strictEqual(formatTimecode(252), "4:12", "Wedding Reel duration from DESIGN §12 (4:12)");
assert.strictEqual(formatTimecode(108), "1:48", "Brand Promo duration from DESIGN §12 (1:48)");
assert.strictEqual(formatTimecode(2285), "38:05", "Podcast duration from DESIGN §12 (38:05)");
assert.strictEqual(formatTimecode(3600), "1:00:00");
assert.strictEqual(formatTimecode(3665), "1:01:05");
assert.strictEqual(formatTimecode(-5), "0:00");
console.log("✓ formatTimecode passed all assertions.\n");

// 2. Byte size formatting tests
console.log("--> Testing formatBytes...");
assert.strictEqual(formatBytes(0), "0 B");
assert.strictEqual(formatBytes(500), "500 B");
assert.strictEqual(formatBytes(1024), "1.0 KB");
assert.strictEqual(formatBytes(1048576), "1.0 MB");
assert.strictEqual(formatBytes(3113851289), "2.9 GB", "Wedding Reel size from DESIGN §12 (2.9 GB)");
assert.strictEqual(formatBytes(1288490188), "1.2 GB", "Brand Promo size from DESIGN §12 (1.2 GB)");
assert.strictEqual(formatBytes(5368709120), "5.0 GB", "MAX_UPLOAD_GB size (5 GB)");
console.log("✓ formatBytes passed all assertions.\n");

// 3. Relative date formatting tests
console.log("--> Testing formatRelative...");
const now = new Date();
assert.strictEqual(formatRelative(now), "just now");
assert.strictEqual(formatRelative(new Date(now.getTime() - 30 * 1000)), "just now");
assert.strictEqual(formatRelative(new Date(now.getTime() - 5 * 60 * 1000)), "5m ago");
assert.strictEqual(formatRelative(new Date(now.getTime() - 3 * 3600 * 1000)), "3h ago");
assert.strictEqual(formatRelative(new Date(now.getTime() - 2 * 24 * 3600 * 1000)), "2d ago");
assert.strictEqual(formatRelative(new Date(now.getTime() - 14 * 24 * 3600 * 1000)), "2w ago");
console.log("✓ formatRelative passed all assertions.\n");

console.log("================================================================================");
console.log("ALL FORMAT UNIT TESTS PASSED!");
console.log("================================================================================\n");
