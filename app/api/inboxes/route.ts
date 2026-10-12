import { NextResponse } from "next/server";
import { getInboxes, addInbox, deleteInbox } from "@/lib/db";
import { verifyInboxConnection } from "@/lib/mailer";

export const dynamic = "force-dynamic";

export async function GET() {
  const inboxes = await getInboxes();
  // Strip app_password from public response for security
  const sanitized = inboxes.map((i) => ({
    ...i,
    app_password: "••••••••••••••••",
  }));
  return NextResponse.json(sanitized);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, display_name, app_password, daily_limit } = body;

    if (!email || !display_name || !app_password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Verify SMTP connection before saving
    const isValid = await verifyInboxConnection({ email, display_name, app_password });
    if (!isValid) {
      return NextResponse.json({
        error: "SMTP Authentication failed. Verify Google App Password and ensure 2-Step Verification is active.",
      }, { status: 400 });
    }

    const created = await addInbox({
      email: email.trim().toLowerCase(),
      display_name: display_name.trim(),
      app_password: app_password.trim(),
      daily_limit: Number(daily_limit) || 15,
      status: "ACTIVE",
    });

    return NextResponse.json({ success: true, inbox: created });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

  const success = await deleteInbox(id);
  return NextResponse.json({ success });
}
