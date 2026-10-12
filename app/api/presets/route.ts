import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const preset = url.searchParams.get("preset") || "school_30";
    const campaignId = url.searchParams.get("campaign_id") || "campaign-school-fl";

    const presetsDir = path.join(process.cwd(), "data", "presets");
    let filename = "school_30.json";
    if (preset === "airport_35") filename = "airport_35.json";
    if (preset === "school_followup_40") filename = "school_followup_40.json";

    const filePath = path.join(presetsDir, filename);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: `Preset file ${filename} not found` }, { status: 404 });
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);

    // Transform into standard Lead payload
    const leads = data.map((item: any, idx: number) => {
      let subject = "{central fl charter rfp / cabling scope|volusia charter school tender} / crew availability";
      let body = "{Hi|Hey|Good morning} {first_name},\n\nReaching out directly to {company_name} regarding the Category 2 low-voltage cabling scope for Burns Science & Technology Charter School in Volusia County.\n\nThe deployment calls for Cat6A plenum drops, patch panels, 24/48-port PoE switching, and indoor/outdoor Access Point mounting (~90 AP units across the campus).\n\nThis is currently in the statutory 28-day E-Rate review window before the school locks their installation vendor.\n\nAre you open to reviewing the spec sheet and BoQ before bidding locks?\n\nBest,\nPandu";

      if (preset === "airport_35") {
        subject = item.subject || `airport work in ${item.city || "your area"} / contractor availability`;
        body = item.p1 
          ? `${item.p1}\n\n${item.p2}\n\n${item.p3}`
          : `{Hi|Hey|Good morning} {first_name},\n\nI have airports in ${item.city || "your area"} that want more contractors bidding on their next runway and taxiway job.\n\nThanks for reading (also, no call needed, I can easily make the introduction).\n\nBest,\nPandu`;
      } else if (preset === "school_followup_40") {
        subject = item.subject_step2 || item.subject || "Re: central fl charter rfp / crew availability";
        body = item.body_step2 || item.body || `{Hi|Hey} {first_name},\n\nCircling back on the Burns SciTech E-Rate Category 2 scope in Volusia County before the bid review closes.\n\nDid your estimating team have a chance to look over the cabling BoQ?\n\nBest,\nPandu`;
      }

      return {
        campaign_id: campaignId,
        recipient_name: item.contact_name || item.contact || item.name || "Estimator",
        recipient_email: item.email,
        company_name: item.company_name || item.company || "Contractor",
        city: item.city || "Florida",
        subject_template: subject,
        body_template: body,
        status: "PENDING",
        scheduled_at: new Date(Date.now() + idx * 5 * 60 * 1000).toISOString(),
      };
    });

    return NextResponse.json({ preset, count: leads.length, leads });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
