import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

declare global {
  var __drizzlePool: Pool | undefined;
}

let connectionString = process.env.DATABASE_URL!;

// Neon requer este parâmetro de compatibilidade SSL com node-postgres
if (!connectionString.includes("uselibpqcompat")) {
  connectionString += connectionString.includes("?") ? "&" : "?";
  connectionString += "uselibpqcompat=true";
}

const pool =
  global.__drizzlePool ??
  new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
  });

if (!global.__drizzlePool) {
  global.__drizzlePool = pool;
}

export const db = drizzle(pool, { schema });
