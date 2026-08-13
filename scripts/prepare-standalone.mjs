import { cp, mkdir, stat } from "node:fs/promises";

if (process.env.VERCEL === "1") {
  process.exit(0);
}

const standaloneRoot = ".next/standalone";

await mkdir(`${standaloneRoot}/.next`, { recursive: true });
await copyIfPresent(".next/static", `${standaloneRoot}/.next/static`);
await copyIfPresent("public", `${standaloneRoot}/public`);

async function copyIfPresent(source, destination) {
  try {
    await stat(source);
  } catch {
    return;
  }
  await cp(source, destination, { recursive: true, force: true });
}
