import { NextResponse } from "next/server";
import { getCampaign, updateCampaign } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || undefined;
  const campaign = await getCampaign(id);
  return NextResponse.json(campaign);
}

export async function PATCH(req: Request) {
  try {
    const updates = await req.json();
    const id = updates.id || "default-campaign";
    const updated = await updateCampaign(id, updates);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
