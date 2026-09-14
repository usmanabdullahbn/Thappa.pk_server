/**
 * Creates 5 demo CAFE businesses (each with an owner login + one branch),
 * and 3 active campaigns per cafe (15 campaigns total) — for testing the
 * "browse campaigns" flow in the mobile app with a realistic amount of data.
 *
 * Safe to re-run — businesses/branches are upserted by owner email/name,
 * and campaigns are only created if a campaign with the same headline for
 * that business doesn't already exist.
 *
 * Usage: npm run seed:cafes
 */
import { connectDb, disconnectDb } from "./config/db";
import { User } from "./models/User";
import { Business, IBusiness } from "./models/Business";
import { Branch, IBranch } from "./models/Branch";
import { Campaign } from "./models/Campaign";
import { hashPassword } from "./modules/auth/auth.service";

const DEMO_PASSWORD = "Test1234!";
const DAY_MS = 24 * 60 * 60 * 1000;

interface CafeSpec {
  ownerName: string;
  ownerEmail: string;
  businessName: string;
  branchName: string;
  address: string;
  lat: number;
  lng: number;
  stampsRequired: number;
  rewardDescription: string;
  campaigns: { headline: string; description: string; stampsRequired: number; rewardDescription: string }[];
}

const CAFES: CafeSpec[] = [
  {
    ownerName: "Hina Yousaf",
    ownerEmail: "cafe1@thappa.test",
    businessName: "Java Junction",
    branchName: "Java Junction - DHA",
    address: "Khayaban-e-Shahbaz, DHA Phase 6, Lahore",
    lat: 31.4697,
    lng: 74.4142,
    stampsRequired: 5,
    rewardDescription: "1 Free Espresso",
    campaigns: [
      { headline: "Weekday Morning Boost", description: "Buy any coffee before 11am and earn a bonus stamp.", stampsRequired: 5, rewardDescription: "1 Free Espresso" },
      { headline: "Bring a Friend", description: "Earn 2 stamps when you check in with a friend's account.", stampsRequired: 8, rewardDescription: "2 Free Pastries" },
      { headline: "Weekend Latte Special", description: "Collect stamps on iced lattes every weekend.", stampsRequired: 6, rewardDescription: "1 Free Iced Latte" },
    ],
  },
  {
    ownerName: "Omar Siddiqui",
    ownerEmail: "cafe2@thappa.test",
    businessName: "Bean There Cafe",
    branchName: "Bean There Cafe - Bahria Town",
    address: "Civic Center, Bahria Town, Rawalpindi",
    lat: 33.5237,
    lng: 73.1000,
    stampsRequired: 6,
    rewardDescription: "1 Free Cappuccino",
    campaigns: [
      { headline: "Study Session Stamps", description: "Double stamps for students on weekday afternoons.", stampsRequired: 6, rewardDescription: "1 Free Cappuccino" },
      { headline: "Pastry Pairing", description: "Buy a coffee + pastry combo and earn an extra stamp.", stampsRequired: 5, rewardDescription: "1 Free Croissant" },
      { headline: "First Visit Bonus", description: "New customers start with 1 free stamp on signup.", stampsRequired: 4, rewardDescription: "1 Free Brewed Coffee" },
    ],
  },
  {
    ownerName: "Zara Farooq",
    ownerEmail: "cafe3@thappa.test",
    businessName: "Roastery 21",
    branchName: "Roastery 21 - Clifton",
    address: "Boat Basin, Clifton, Karachi",
    lat: 24.8235,
    lng: 67.0308,
    stampsRequired: 5,
    rewardDescription: "1 Free Flat White",
    campaigns: [
      { headline: "Flat White Fridays", description: "Every Friday, flat whites earn double stamps.", stampsRequired: 5, rewardDescription: "1 Free Flat White" },
      { headline: "Loyalty Launch Week", description: "Limited-time launch campaign with a lower stamp target.", stampsRequired: 3, rewardDescription: "1 Free Cold Brew" },
      { headline: "Refer & Earn", description: "Earn a stamp for every friend you refer who joins.", stampsRequired: 7, rewardDescription: "1 Free Bag of Beans (250g)" },
    ],
  },
  {
    ownerName: "Bilal Sheikh",
    ownerEmail: "cafe4@thappa.test",
    businessName: "The Daily Grind",
    branchName: "The Daily Grind - F-7",
    address: "F-7 Markaz, Islamabad",
    lat: 33.7180,
    lng: 73.0562,
    stampsRequired: 8,
    rewardDescription: "1 Free Signature Latte",
    campaigns: [
      { headline: "Grind Club Rewards", description: "Standard loyalty stamps on every purchase over Rs. 300.", stampsRequired: 8, rewardDescription: "1 Free Signature Latte" },
      { headline: "Happy Hour Stamps", description: "Extra stamp for visits between 3pm-5pm.", stampsRequired: 6, rewardDescription: "1 Free Americano" },
      { headline: "Birthday Month Bonus", description: "Customers get a free stamp during their birthday month.", stampsRequired: 5, rewardDescription: "1 Free Dessert" },
    ],
  },
  {
    ownerName: "Ayesha Noor",
    ownerEmail: "cafe5@thappa.test",
    businessName: "Cafe Latitude",
    branchName: "Cafe Latitude - Gulberg",
    address: "Main Boulevard, Gulberg II, Lahore",
    lat: 31.5204,
    lng: 74.3587,
    stampsRequired: 5,
    rewardDescription: "1 Free Mocha",
    campaigns: [
      { headline: "Mocha Mondays", description: "Bonus stamp on mochas every Monday.", stampsRequired: 5, rewardDescription: "1 Free Mocha" },
      { headline: "Brunch & Brew", description: "Earn stamps faster during weekend brunch hours.", stampsRequired: 6, rewardDescription: "1 Free Brunch Item" },
      { headline: "App Exclusive Launch", description: "Campaign exclusive to customers who joined via the app.", stampsRequired: 4, rewardDescription: "1 Free Iced Tea" },
    ],
  },
];

async function ensureCafe(spec: CafeSpec): Promise<{ business: IBusiness; branch: IBranch }> {
  let owner = await User.findOne({ email: spec.ownerEmail });
  let business: IBusiness | null;

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
      category: "CAFE",
      ownerUserId: owner._id,
      status: "ACTIVE",
      loyaltyRule: {
        stampsRequired: spec.stampsRequired,
        rewardDescription: spec.rewardDescription,
      },
    });

    owner.businessId = business._id as any;
    await owner.save();
    console.log(`[seed:cafes] created cafe       -> ${spec.businessName} (owner ${spec.ownerEmail} / ${DEMO_PASSWORD})`);
  } else {
    business = await Business.findOne({ ownerUserId: owner._id });
    console.log(`[seed:cafes] cafe already exists -> ${spec.businessName} (owner ${spec.ownerEmail} / ${DEMO_PASSWORD})`);
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
    console.log(`[seed:cafes]   + branch         -> ${spec.branchName}`);
  }

  return { business, branch };
}

async function ensureCampaigns(business: IBusiness, spec: CafeSpec) {
  for (const c of spec.campaigns) {
    const existing = await Campaign.findOne({ businessId: business._id, headline: c.headline });
    if (existing) {
      console.log(`[seed:cafes]   = campaign exists -> ${c.headline}`);
      continue;
    }
    await Campaign.create({
      businessId: business._id,
      headline: c.headline,
      description: c.description,
      stampsRequired: c.stampsRequired,
      rewardDescription: c.rewardDescription,
      isActive: true,
      expiresAt: new Date(Date.now() + 90 * DAY_MS),
    });
    console.log(`[seed:cafes]   + campaign        -> ${c.headline}`);
  }
}

async function seedCafes() {
  await connectDb();

  console.log(`[seed:cafes] seeding ${CAFES.length} cafes with 3 campaigns each...\n`);

  for (const spec of CAFES) {
    const { business } = await ensureCafe(spec);
    await ensureCampaigns(business, spec);
  }

  console.log("\n[seed:cafes] ===================== CAFE ACCOUNTS =====================");
  for (const spec of CAFES) {
    console.log(`[seed:cafes] BUSINESS  ${spec.ownerEmail} / ${DEMO_PASSWORD}  (${spec.businessName})`);
  }
  console.log("[seed:cafes] ===========================================================\n");

  await disconnectDb();
}

seedCafes().catch((err) => {
  console.error("[seed:cafes] failed", err);
  process.exit(1);
});
