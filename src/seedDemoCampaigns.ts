/**
 * Adds 3 campaigns each to the original seed:demo businesses (Melbrew Coffee,
 * Foods Inn), which predate the campaign feature and so were never given any.
 * Idempotent — only creates campaigns that don't already exist by headline.
 *
 * Usage: npm run seed:demo-campaigns
 */
import { connectDb, disconnectDb } from "./config/db";
import { Business } from "./models/Business";
import { Campaign } from "./models/Campaign";

const DAY_MS = 24 * 60 * 60 * 1000;

const CAMPAIGNS_BY_BUSINESS: Record<string, { headline: string; description: string; stampsRequired: number; rewardDescription: string }[]> = {
  "Melbrew Coffee": [
    { headline: "Morning Regulars Club", description: "Every coffee before 11am earns a stamp toward a free iced latte.", stampsRequired: 5, rewardDescription: "1 Free Iced Latte" },
    { headline: "Bean Lovers Bonus", description: "Buy any bag of beans and get 2 stamps instead of 1.", stampsRequired: 6, rewardDescription: "1 Free Cappuccino" },
    { headline: "Weekend Wind-Down", description: "Collect stamps on weekend visits for a free pastry.", stampsRequired: 4, rewardDescription: "1 Free Pastry" },
  ],
  "Foods Inn": [
    { headline: "Family Feast Rewards", description: "Standard loyalty stamps on every dine-in order over Rs. 1000.", stampsRequired: 10, rewardDescription: "10 Stamps for 50% Off" },
    { headline: "Lunch Deal Stamps", description: "Extra stamp for weekday lunch orders between 12pm-3pm.", stampsRequired: 8, rewardDescription: "1 Free Starter" },
    { headline: "Delivery Loyalty", description: "Stamps for online delivery orders placed through the app.", stampsRequired: 6, rewardDescription: "1 Free Soft Drink (4 pack)" },
  ],
};

async function seedDemoCampaigns() {
  await connectDb();

  for (const [businessName, campaigns] of Object.entries(CAMPAIGNS_BY_BUSINESS)) {
    const business = await Business.findOne({ name: businessName });
    if (!business) {
      console.log(`[seed:demo-campaigns] business not found -> ${businessName} (run npm run seed:demo first)`);
      continue;
    }

    for (const c of campaigns) {
      const existing = await Campaign.findOne({ businessId: business._id, headline: c.headline });
      if (existing) {
        console.log(`[seed:demo-campaigns]   = campaign exists -> ${businessName} / ${c.headline}`);
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
      console.log(`[seed:demo-campaigns]   + campaign -> ${businessName} / ${c.headline}`);
    }
  }

  await disconnectDb();
}

seedDemoCampaigns().catch((err) => {
  console.error("[seed:demo-campaigns] failed", err);
  process.exit(1);
});
