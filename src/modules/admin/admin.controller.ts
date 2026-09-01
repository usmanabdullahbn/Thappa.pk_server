import { Request, Response } from "express";
import { asyncHandler, ApiError } from "../../middleware/errorHandler";
import { User } from "../../models/User";
import { Business } from "../../models/Business";
import { Branch } from "../../models/Branch";
import { StampTransaction } from "../../models/StampTransaction";
import { hashPassword } from "../auth/auth.service";

export const createBusiness = asyncHandler(async (req: Request, res: Response) => {
  const { businessName, category, ownerName, ownerEmail, ownerPassword, branchName, branchAddress, lat, lng } =
    req.body as {
      businessName: string;
      category?: string;
      ownerName: string;
      ownerEmail: string;
      ownerPassword: string;
      branchName: string;
      branchAddress?: string;
      lat?: number;
      lng?: number;
    };

  const existing = await User.findOne({ email: ownerEmail.toLowerCase() });
  if (existing) throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists");

  const passwordHash = await hashPassword(ownerPassword);

  const ownerUser = await User.create({
    role: "BUSINESS",
    name: ownerName,
    email: ownerEmail.toLowerCase(),
    authProvider: "PASSWORD",
    passwordHash,
  });

  const business = await Business.create({
    name: businessName,
    category: category || "CAFE",
    ownerUserId: ownerUser._id,
    onboardedByAdminId: req.user!.userId,
    status: "ACTIVE",
  });

  ownerUser.businessId = business._id as any;
  await ownerUser.save();

  const branch = await Branch.create({
    businessId: business._id,
    name: branchName || `${businessName} - Main Branch`,
    address: branchAddress,
    location: { type: "Point", coordinates: [lng ?? 0, lat ?? 0] },
    staffUserIds: [ownerUser._id],
  });

  res.status(201).json({ business, branch, owner: { id: ownerUser._id, email: ownerUser.email } });
});

export const listBusinesses = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt((req.query.page as string) || "1", 10);
  const limit = parseInt((req.query.limit as string) || "20", 10);
  const status = req.query.status as string | undefined;

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;

  const [data, totalCount] = await Promise.all([
    Business.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Business.countDocuments(filter),
  ]);

  res.json({ data, page, totalPages: Math.ceil(totalCount / limit), totalCount });
});

export const getBusinessDetail = asyncHandler(async (req: Request, res: Response) => {
  const business = await Business.findById(req.params.id);
  if (!business) throw new ApiError(404, "NOT_FOUND", "Business not found");

  const branches = await Branch.find({ businessId: business._id });
  const stampVolume = await StampTransaction.countDocuments({ businessId: business._id, type: "EARN" });

  res.json({ business, branches, stampVolume });
});

export const updateBusinessStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body as { status: "PENDING" | "ACTIVE" | "SUSPENDED" | "CANCELLED" };
  const business = await Business.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!business) throw new ApiError(404, "NOT_FOUND", "Business not found");
  res.json({ business });
});

export const platformOverview = asyncHandler(async (_req: Request, res: Response) => {
  const [activeBusinesses, totalBusinesses, totalStamps, totalCustomers] = await Promise.all([
    Business.countDocuments({ status: "ACTIVE" }),
    Business.countDocuments({}),
    StampTransaction.countDocuments({ type: "EARN" }),
    User.countDocuments({ role: "CUSTOMER" }),
  ]);
  res.json({ activeBusinesses, totalBusinesses, totalStamps, totalCustomers });
});
