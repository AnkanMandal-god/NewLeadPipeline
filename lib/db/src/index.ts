import { MongoClient, type Db, type Collection, type Document } from "mongodb";

// Checked lazily so the module can be imported even when the secret has not
// been configured yet (the API starts in "not_configured" mode and any actual
// DB call will throw with a clear message rather than crashing at boot).
//
// `_client` is intentionally mutable so `reinitializeDb` can swap in a new
// connection when the user saves a MONGODB_URI via the Settings page without
// requiring a server restart.

// MONGODB_URI may or may not embed a default database name (the path segment
// after the host, e.g. mongodb+srv://user:pass@cluster.mongodb.net/mydb).
// Fall back to a fixed name so the app works either way.
const DB_NAME = process.env.MONGODB_DB || "vibe_prospector";

let _client: MongoClient | null = process.env.MONGODB_URI
  ? new MongoClient(process.env.MONGODB_URI)
  : null;

let dbPromise: Promise<Db> | null = null;

/**
 * Replace the active MongoDB client with one using the supplied URI.
 * Closes the old connection (if any), then creates a fresh MongoClient.
 * The next call to getDb() will establish the new connection.
 */
export async function reinitializeDb(uri: string): Promise<void> {
  if (_client) {
    await _client.close().catch(() => {}); // ignore close errors
  }
  dbPromise = null;
  _client = new MongoClient(uri);
}

export async function getDb(): Promise<Db> {
  if (!_client) {
    throw new Error(
      "MONGODB_URI must be set. Add it as a Replit Secret or enter it in the Settings page.",
    );
  }
  if (!dbPromise) {
    dbPromise = _client.connect().then((c) => c.db(DB_NAME));
  }
  return dbPromise;
}

export async function getCollection<T extends Document = Document>(
  name: string,
): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

/**
 * MongoDB has no native auto-increment. This mirrors Postgres SERIAL columns
 * using an atomic findOneAndUpdate against a `counters` collection, so the
 * rest of the app (and the API's public integer ids) can stay unchanged.
 */
export async function nextId(sequenceName: string): Promise<number> {
  const db = await getDb();
  const result = await db
    .collection("counters")
    .findOneAndUpdate(
      { _id: sequenceName as unknown as never },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return (result as unknown as { seq: number }).seq;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
  }
  dbPromise = null;
}

export { client as mongoClient };
