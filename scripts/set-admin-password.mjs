#!/usr/bin/env node
/**
 * Usage: node scripts/set-admin-password.mjs <newPassword>
 *
 * Hashes <newPassword> with bcrypt and writes it into
 * artifacts/api-server/local-users.json for the "admin" user.
 * This lets you log in to the dashboard even before MongoDB is configured.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_USERS_PATH = path.resolve(__dirname, "../artifacts/api-server/local-users.json");

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error("Usage: node scripts/set-admin-password.mjs <password>  (min 8 characters)");
  process.exit(1);
}

// Dynamically import bcryptjs from the api-server package
const { default: bcrypt } = await import(
  path.resolve(__dirname, "../artifacts/api-server/node_modules/bcryptjs/dist/bcrypt.js")
);

const passwordHash = await bcrypt.hash(password, 10);

let users = [];
try {
  users = JSON.parse(fs.readFileSync(LOCAL_USERS_PATH, "utf8"));
} catch {
  // file missing or empty — start fresh
}

const adminIndex = users.findIndex((u) => u.username === "admin");
const adminUser = {
  id: 0,
  username: "admin",
  passwordHash,
  role: "admin",
  createdAt: new Date().toISOString(),
};

if (adminIndex >= 0) {
  users[adminIndex] = { ...users[adminIndex], passwordHash };
} else {
  users.unshift(adminUser);
}

fs.writeFileSync(LOCAL_USERS_PATH, JSON.stringify(users, null, 2) + "\n");
console.log("✓ Admin password updated in local-users.json");
