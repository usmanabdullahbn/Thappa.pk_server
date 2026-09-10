import dns from "dns";
import mongoose from "mongoose";
import { env } from "./env";

// mongodb+srv:// URIs need a DNS SRV lookup to find the cluster's real hosts.
// Node's resolver (c-ares) sends that query straight to whatever DNS server
// is configured on the machine. Many home routers (a common default like
// 192.168.0.1) don't handle raw SRV queries and refuse them, which surfaces
// as `querySrv ECONNREFUSED ...mongodb.net` even though the connection
// string, credentials, and cluster are all fine. Pointing Node's resolver at
// public DNS servers avoids the router entirely and fixes it in most cases.
if (env.mongodbUri.startsWith("mongodb+srv://")) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

export async function connectDb(): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongodbUri);
  // eslint-disable-next-line no-console
  console.log(`[db] connected -> ${env.mongodbUri}`);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
