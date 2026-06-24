const { Client } = require('pg');
const client = new Client({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:55322/postgres"
});
async function main() {
  await client.connect();
  console.log("Connected to database.");
  
  // 1. Add dedupeKey column if not exists
  await client.query('ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "dedupeKey" text;');
  console.log("Added dedupeKey column.");
  
  // 2. Add unique constraint if not exists
  try {
    await client.query('ALTER TABLE "notification" ADD CONSTRAINT "notification_orgId_userId_dedupeKey_key" UNIQUE ("orgId", "userId", "dedupeKey");');
    console.log("Added unique constraint.");
  } catch (err) {
    if (err.code === '42710') {
      console.log("Unique constraint already exists, skipping.");
    } else {
      throw err;
    }
  }
  
  await client.end();
}
main().catch(console.error);
