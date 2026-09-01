import mongoose from "mongoose";
import { env } from "./env";

export async function connectDb(): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongodbUri);
  // eslint-disable-next-line no-console
  console.log(`[db] connected -> ${env.mongodbUri}`);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
