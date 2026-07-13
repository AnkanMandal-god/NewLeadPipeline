import { MongoClient, type Db, type Collection, type Document } from "mongodb";

if (!process.env.MONGODB_URI) {
  throw new Error(
    "MONGODB_URI must be set. Did you forget to provision a MongoDB Atlas database and add its connection string as a secret?",
  );
}

const client = new MongoClient(process.env.MONGODB_URI);

// MONGODB_URI may or may not embed a default database name (the path segment
// after the host, e.g. mongodb+srv://user:pass@cluster.mongodb.net/mydb).
// Fall back to a fixed name so the app works either way.
const DB_NAME = process.env.MONGODB_DB || "vibe_prospector";

let dbPromise: Promise<Db> | null = null;

export async function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = client.connect().then((c) => c.db(DB_NAME));
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
  await client.close();
  dbPromise = null;
}

export { client as mongoClient };
