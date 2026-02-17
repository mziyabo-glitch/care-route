import { NextResponse } from "next/server";

export async function GET() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "unknown";

  return NextResponse.json({
    ok: true,
    commit,
    timestamp: new Date().toISOString(),
  });
}
