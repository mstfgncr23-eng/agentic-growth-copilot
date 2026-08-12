import type { AgentStore } from "@/src/persistence/agent-store";

export const DEMO_WORKSPACE_ID = "workspace_demo";
export const DEMO_PROJECT_ID = "project_acme_analytics";
export const DEMO_CONVERSATION_ID = "conversation_growth_sprint";

const timestamp = "2026-08-01T09:00:00.000Z";

export async function ensureDemoSeed(store: AgentStore): Promise<void> {
  await Promise.all([
    store.upsertProject({
      id: DEMO_PROJECT_ID,
      workspaceId: DEMO_WORKSPACE_ID,
      name: "Acme Analytics",
      metricsSnapshot: {
        dataAsOf: "2026-07-31T23:59:59.000Z",
        windowDays: 30,
        funnel: [
          { key: "signup", label: "Signed up", users: 5_000 },
          { key: "trial_started", label: "Trial started", users: 3_200 },
          { key: "activated", label: "Activated", users: 1_520 },
          { key: "upgrade_viewed", label: "Upgrade viewed", users: 980 },
          { key: "paid", label: "Paid", users: 352 },
        ],
        segments: [
          {
            key: "small_team",
            label: "Small teams",
            trialUsers: 1_760,
            paidUsers: 229,
          },
          {
            key: "solo",
            label: "Solo operators",
            trialUsers: 960,
            paidUsers: 67,
          },
          {
            key: "mid_market",
            label: "Mid-market",
            trialUsers: 480,
            paidUsers: 56,
          },
        ],
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    store.createConversation({
      id: DEMO_CONVERSATION_ID,
      workspaceId: DEMO_WORKSPACE_ID,
      title: "Trial conversion sprint",
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  ]);
}
