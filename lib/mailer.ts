import nodemailer from "nodemailer";

export interface InboxAuth {
  email: string;
  display_name: string;
  app_password: string;
}

export function createGmailTransporter(inbox: InboxAuth) {
  // Clean password (remove spaces if user copied "xxxx xxxx xxxx xxxx" from Google App Password screen)
  const cleanedPassword = inbox.app_password.replace(/\s+/g, "");

  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // SSL
    auth: {
      user: inbox.email,
      pass: cleanedPassword,
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 8000,
  });
}

export async function verifyInboxConnection(inbox: InboxAuth): Promise<boolean> {
  try {
    const transporter = createGmailTransporter(inbox);
    await transporter.verify();
    return true;
  } catch (error) {
    console.error(`[SMTP Verify Failed] ${inbox.email}:`, error);
    return false;
  }
}
