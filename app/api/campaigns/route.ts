import { NextResponse } from "next/server";
import { getCampaigns, createCampaign, updateCampaign, deleteCampaign } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const campaigns = await getCampaigns();
  return NextResponse.json(campaigns);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.name) {
      return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
    }
    const campaign = await createCampaign({
      name: body.name,
      market_category: body.market_category || "CUSTOM",
      status: body.status || "ACTIVE",
      timezone: body.timezone || "America/New_York",
      window_start: body.window_start || "07:30",
      window_end: body.window_end || "18:00",
      min_interval_mins: body.min_interval_mins || 4,
      max_interval_mins: body.max_interval_mins || 8,
      subject_default: body.subject_default || "",
      body_default: body.body_default || "",
    });
    return NextResponse.json(campaign);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: "Campaign id is required" }, { status: 400 });
    }
    const updated = await updateCampaign(id, updates);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Campaign id is required" }, { status: 400 });
    }
    const success = await deleteCampaign(id);
    return NextResponse.json({ success });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
