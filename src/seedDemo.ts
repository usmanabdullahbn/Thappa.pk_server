/**
 * Creates a fixed set of demo accounts for manual/QA testing:
 *   - 1 admin
 *   - 2 businesses (each with an owner login + one branch)
 *   - 3 customers, each with some pre-seeded stamp progress
 *
 * Safe to re-run — every account is upserted by its unique email/phone, and
 * stamp cards are only created if they don't already exist.
 *
 * Usage: npm run seed:demo
 */
import { connectDb, disconnectDb } from "./config/db";
import { env } from "./config/env";
import { User } from "./models/User";
import { Business } from "./models/Business";
import { Branch } from "./models/Branch";
import { StampCard } from "./models/StampCard";
import { StampTransaction } from "./models/StampTransaction";
import { hashPassword } from "./modules/auth/auth.service";

const DEMO_PASSWORD = "Test1234!";

async function ensureAdmin() {
  const email = env.seedAdminEmail;
  let admin = await User.findOne({ email, role: "ADMIN" });
  if (!admin) {
    admin = await User.create({
      role: "ADMIN",
      name: env.seedAdminName,
      email,
      authProvider: "PASSWORD",
      passwordHash: await hashPassword(env.seedAdminPassword),
    });
    console.log(`[seed:demo] created admin       -> ${email} / ${env.seedAdminPassword}`);
  } else {
    console.log(`[seed:demo] admin already exists -> ${email} / ${env.seedAdminPassword}`);
  }
  return admin;
}

interface BusinessSpec {
  ownerName: string;
  ownerEmail: string;
  businessName: string;
  category: "CAFE" | "RESTAURANT";
  branchName: string;
  address: string;
  lat: number;
  lng: number;
  stampsRequired: number;
  rewardDescription: string;
}

async function ensureBusiness(spec: BusinessSpec) {
  let owner = await User.findOne({ email: spec.ownerEmail });
  let business;

  if (!owner) {
    owner = await User.create({
      role: "BUSINESS",
      name: spec.ownerName,
      email: spec.ownerEmail,
      authProvider: "PASSWORD",
      passwordHash: await hashPassword(DEMO_PASSWORD),
    });

    business = await Business.create({
      name: spec.businessName,
      category: spec.category,
      ownerUserId: owner._id,
      status: "ACTIVE",
      loyaltyRule: {
        stampsRequired: spec.stampsRequired,
        rewardDescription: spec.rewardDescription,
      },
    });

    owner.businessId = business._id as any;
    await owner.save();
    console.log(`[seed:demo] created business    -> ${spec.businessName} (owner ${spec.ownerEmail} / ${DEMO_PASSWORD})`);
  } else {
    business = await Business.findOne({ ownerUserId: owner._id });
    console.log(`[seed:demo] business exists     -> ${spec.businessName} (owner ${spec.ownerEmail} / ${DEMO_PASSWORD})`);
  }

  if (!business) throw new Error(`Business record missing for owner ${spec.ownerEmail}`);

  let branch = await Branch.findOne({ businessId: business._id, name: spec.branchName });
  if (!branch) {
    branch = await Branch.create({
      businessId: business._id,
      name: spec.branchName,
      address: spec.address,
      location: { type: "Point", coordinates: [spec.lng, spec.lat] },
      staffUserIds: [owner._id],
    });
    console.log(`[seed:demo]   + branch          -> ${spec.branchName}`);
  }

  return { owner, business, branch };
}

interface CustomerSpec {
  name: string;
  phone: string;
}

async function ensureCustomer(spec: CustomerSpec) {
  let customer = await User.findOne({ phone: spec.phone });
  if (!customer) {
    customer = await User.create({
      role: "CUSTOMER",
      name: spec.name,
      phone: spec.phone,
      authProvider: "PHONE_OTP",
    });
    console.log(`[seed:demo] created customer    -> ${spec.name} / ${spec.phone}`);
  } else {
    console.log(`[seed:demo] customer exists     -> ${spec.name} / ${spec.phone}`);
  }
  return customer;
}

async function ensureStampCard(
  customer: { _id: unknown },
  branch: { _id: unknown; businessId: unknown },
  business: { _id: unknown; loyaltyRule: { stampsRequired: number } },
  currentStamps: number
) {
  const existing = await StampCard.findOne({ customerId: customer._id, branchId: branch._id, campaignId: null });
  if (existing) return existing;

  const card = await StampCard.create({
    customerId: customer._id,
    businessId: business._id,
    branchId: branch._id,
    currentStamps,
    stampsRequired: business.loyaltyRule.stampsRequired,
    totalStampsEarnedLifetime: currentStamps,
    lastStampAt: new Date(),
  });

  const txs = Array.from({ length: currentStamps }).map((_, i) => ({
    stampCardId: card._id,
    customerId: customer._id,
    businessId: business._id,
    branchId: branch._id,
    type: "EARN" as const,
    createdAt: new Date(Date.now() - (currentStamps - i) * 24 * 60 * 60 * 1000),
  }));
  if (txs.length) await StampTransaction.insertMany(txs);

  return card;
}

async function seedDemo() {
  await connectDb();

  await ensureAdmin();

  const { business: melbrew, branch: melbrewBranch } = await ensureBusiness({
    ownerName: "Sara Malik",
    ownerEmail: "business1@thappa.test",
    businessName: "Melbrew Coffee",
    category: "CAFE",
    branchName: "Melbrew Coffee - Gulberg",
    address: "MM Alam Road, Gulberg III, Lahore",
    lat: 31.5099,
    lng: 74.3436,
    stampsRequired: 5,
    rewardDescription: "1 Free Iced Latte",
  });

  const { business: foodsInn, branch: foodsInnBranch } = await ensureBusiness({
    ownerName: "Ahmed Raza",
    ownerEmail: "business2@thappa.test",
    businessName: "Foods Inn",
    category: "RESTAURANT",
    branchName: "Foods Inn - Clifton",
    address: "Khayaban-e-Iqbal, Clifton, Karachi",
    lat: 24.8138,
    lng: 67.0299,
    stampsRequired: 10,
    rewardDescription: "10 Stamps for 50% Off",
  });

  const customerSpecs: CustomerSpec[] = [
    { name: "Ali Hassan", phone: "+923001112233" },
    { name: "Sana Ahmed", phone: "+923004445566" },
    { name: "Bilal Khan", phone: "+923007778899" },
  ];
  const customers = [];
  for (const spec of customerSpecs) {
    customers.push(await ensureCustomer(spec));
  }

  // Give each customer some realistic in-progress stamp cards to test with,
  // without needing to scan a QR from a fresh account.
  await ensureStampCard(customers[0], melbrewBranch, melbrew, 3);
  await ensureStampCard(customers[0], foodsInnBranch, foodsInn, 7);

  await ensureStampCard(customers[1], melbrewBranch, melbrew, 5); // reward ready
  await ensureStampCard(customers[1], foodsInnBranch, foodsInn, 2);

  await ensureStampCard(customers[2], foodsInnBranch, foodsInn, 0);

  console.log("\n[seed:demo] ===================== DEMO ACCOUNTS =====================");
  console.log(`[seed:demo] ADMIN     ${env.seedAdminEmail} / ${env.seedAdminPassword}`);
  console.log(`[seed:demo] BUSINESS  business1@thappa.test / ${DEMO_PASSWORD}  (Melbrew Coffee)`);
  console.log(`[seed:demo] BUSINESS  business2@thappa.test / ${DEMO_PASSWORD}  (Foods Inn)`);
  console.log(`[seed:demo] CUSTOMER  +923001112233 (Ali Hassan)  -- OTP is printed to console on /auth/otp/send`);
  console.log(`[seed:demo] CUSTOMER  +923004445566 (Sana Ahmed)  -- reward ready at Melbrew Coffee`);
  console.log(`[seed:demo] CUSTOMER  +923007778899 (Bilal Khan)  -- no stamps yet at Foods Inn`);
  console.log("[seed:demo] ===========================================================\n");

  await disconnectDb();
}

seedDemo().catch((err) => {
  console.error("[seed:demo] failed", err);
  process.exit(1);
});
