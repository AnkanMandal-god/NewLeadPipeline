import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { getCollection, nextId } from "@workspace/db";
import { requireAuth, requireRole, type UserRole } from "../lib/auth";
import { findLocalUserByUsername, findLocalUserById } from "../lib/local-users";

const router: IRouter = Router();

const VALID_ROLES: UserRole[] = ["admin", "sales_caller"];

interface UserDoc {
  id: number;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

function publicUser(user: UserDoc) {
  return { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt };
}

// POST /api/auth/login
router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    const normalizedUsername = username.trim().toLowerCase();
    let user: UserDoc | null | undefined = null;

    // Try MongoDB first; fall back to local-users.json when DB is unavailable.
    try {
      const users = await getCollection<UserDoc>("users");
      user = await users.findOne({ username: normalizedUsername });
    } catch {
      user = findLocalUserByUsername(normalizedUsername) ?? null;
    }

    // MongoDB returned nothing — also check the file store (e.g. bootstrapping).
    if (!user) {
      user = findLocalUserByUsername(normalizedUsername) ?? null;
    }

    if (!user) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;

    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: "Failed to log in" });
  }
});

// POST /api/auth/logout
router.post("/auth/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.clearCookie("vp.sid");
    res.json({ ok: true });
  });
});

// GET /api/auth/me
router.get("/auth/me", requireAuth, async (req: Request, res: Response) => {
  try {
    let user: UserDoc | null | undefined = null;

    try {
      const users = await getCollection<UserDoc>("users");
      user = await users.findOne({ id: req.session.userId });
    } catch {
      user = findLocalUserById(req.session.userId!) ?? null;
    }

    // Also check file store if Mongo returned nothing (file-bootstrapped session).
    if (!user) {
      user = findLocalUserById(req.session.userId!) ?? null;
    }

    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    res.json({ user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch current user" });
  }
});

// GET /api/auth/users — admin only
router.get("/auth/users", requireRole("admin"), async (_req: Request, res: Response) => {
  try {
    const users = await getCollection<UserDoc>("users");
    const all = await users.find({}).sort({ createdAt: 1 }).toArray();
    res.json({ users: all.map(publicUser) });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// POST /api/auth/users — admin only, create a new account
router.post("/auth/users", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { username, password, role } = req.body as {
      username?: string;
      password?: string;
      role?: UserRole;
    };

    if (!username || !password || !role) {
      res.status(400).json({ error: "username, password, and role are required" });
      return;
    }
    if (!VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `Invalid role: ${role}` });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const users = await getCollection<UserDoc>("users");
    const normalizedUsername = username.trim().toLowerCase();
    const existing = await users.findOne({ username: normalizedUsername });
    if (existing) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = await nextId("users");
    const doc: UserDoc = {
      id,
      username: normalizedUsername,
      passwordHash,
      role,
      createdAt: new Date().toISOString(),
    };
    await users.insertOne(doc);

    res.status(201).json({ user: publicUser(doc) });
  } catch (err) {
    res.status(500).json({ error: "Failed to create user" });
  }
});

// DELETE /api/auth/users/:id — admin only
router.delete("/auth/users/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params["id"] as string, 10);
    if (id === req.session.userId) {
      res.status(400).json({ error: "You cannot delete your own account" });
      return;
    }

    const users = await getCollection<UserDoc>("users");
    const adminCount = await users.countDocuments({ role: "admin" });
    const target = await users.findOne({ id });
    if (target?.role === "admin" && adminCount <= 1) {
      res.status(400).json({ error: "Cannot delete the last remaining admin account" });
      return;
    }

    const result = await users.deleteOne({ id });
    if (!result.deletedCount) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
