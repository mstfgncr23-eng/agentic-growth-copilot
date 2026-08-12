import { getPersistenceDriver } from "@/src/persistence/store-provider";

export async function GET() {
  return Response.json({
    status: "healthy",
    mode: process.env.AI_MODE ?? "mock",
    persistence: getPersistenceDriver(),
    timestamp: new Date().toISOString(),
  });
}
