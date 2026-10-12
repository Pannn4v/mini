import { NextResponse } from "next/server";
import { getLeads, addLeads, clearLeads } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign_id") || undefined;
  const leads = await getLeads(campaignId);
  return NextResponse.json(leads);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { leads } = body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: "Invalid leads array" }, { status: 400 });
    }

    const created = await addLeads(leads);
    return NextResponse.json({ success: true, count: created.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign_id") || undefined;
  await clearLeads(campaignId);
  return NextResponse.json({ success: true, message: "Queue cleared" });
}
