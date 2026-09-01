import { connectDb, disconnectDb } from "./config/db";
import { env } from "./config/env";
import { User } from "./models/User";
import { hashPassword } from "./modules/auth/auth.service";

async function seed() {
  await connectDb();

  const existing = await User.findOne({ email: env.seedAdminEmail, role: "ADMIN" });
  if (existing) {
    // eslint-disable-next-line no-console
    console.log(`[seed] Admin already exists: ${env.seedAdminEmail}`);
  } else {
    const passwordHash = await hashPassword(env.seedAdminPassword);
    await User.create({
      role: "ADMIN",
      name: env.seedAdminName,
      email: env.seedAdminEmail,
      authProvider: "PASSWORD",
      passwordHash,
    });
    // eslint-disable-next-line no-console
    console.log(`[seed] Created admin: ${env.seedAdminEmail} / ${env.seedAdminPassword}`);
  }

  await disconnectDb();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[seed] failed", err);
  process.exit(1);
});
