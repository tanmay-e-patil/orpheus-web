import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db"; // your drizzle instance
import { username } from "better-auth/plugins/username";
import * as schema from "./db/schema";
import { env } from "./env";

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
  },
  database: drizzleAdapter(db, {
    provider: "pg", // or "mysql", "sqlite"
    schema: schema, // your drizzle schema
  }),
  plugins: [username()],
  secret: env.BETTER_AUTH_SECRET,
});
