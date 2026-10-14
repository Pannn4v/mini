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
      let subject = "{central fl charter rfp / cabling scope|central fl school cabling inquiry} / crew availability";
      let body = "{Hi|Hey|Good morning} {first_name},\n\nReaching out because I connect Florida infrastructure contractors with local school campuses (I do this independently, I don't represent them).\n\nI have an active public charter campus in the Central Florida corridor with an open Cat6 cabling, core switching, and Wi-Fi scope before the competitive filing locks.\n\nBefore I route anyone your way, would you let me know if your team has room to take on another project this quarter?\n\nBest,\nPandu";

      if (preset === "airport_35") {
        subject = item.subject || `airport work in ${item.city || "your area"} / contractor availability`;
        body = item.p1 
          ? `${item.p1}\n\n${item.p2}\n\n${item.p3}`
          : `{Hi|Hey|Good morning} {first_name},\n\nI have airports in ${item.city || "your area"} that want more contractors bidding on their next runway and taxiway job.\n\nThanks for reading (also, no call needed, I can easily make the introduction).\n\nBest,\nPandu`;
      } else if (preset === "school_followup_40") {
        subject = item.subject_step2 || item.subject || "Re: central fl charter rfp / crew availability";
        body = item.body_step2 || item.body || `{Hi|Hey} {first_name},\n\nCircling back on the Central Florida charter campus Cat6 cabling & network scope before the competitive filing window locks.\n\nDid your estimating team have a chance to check crew availability for this quarter?\n\nBest,\nPandu`;
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
