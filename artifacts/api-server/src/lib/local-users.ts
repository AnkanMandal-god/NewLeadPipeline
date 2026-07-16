/**
 * File-based user store — used as a fallback when MongoDB is unavailable.
 * Credentials are stored in local-users.json (gitignored) next to the package root.
 * Use scripts/set-admin-password.mjs to change the admin password.
 */
import fs from "node:fs";
import path from "node:path";

export interface LocalUser {
  id: number;
  username: string;
  passwordHash: string;
  role: "admin" | "sales_caller";
  createdAt: string;
}

const LOCAL_USERS_PATH = path.resolve(
  import.meta.dirname,
  "../local-users.json",
);

export function readLocalUsers(): LocalUser[] {
  try {
    const raw = fs.readFileSync(LOCAL_USERS_PATH, "utf8");
    return JSON.parse(raw) as LocalUser[];
  } catch {
    return [];
  }
}

export function findLocalUserByUsername(username: string): LocalUser | undefined {
  return readLocalUsers().find((u) => u.username === username);
}

export function findLocalUserById(id: number): LocalUser | undefined {
  return readLocalUsers().find((u) => u.id === id);
}
