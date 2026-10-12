import { NextResponse } from "next/server";
import { getOutboundLogs } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const logs = await getOutboundLogs();
  return NextResponse.json(logs);
}
