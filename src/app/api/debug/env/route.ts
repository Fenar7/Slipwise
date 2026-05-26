import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    gmail_client_id: process.env.GMAIL_CLIENT_ID ? "[SET]" : "[MISSING]",
    gmail_client_secret: process.env.GMAIL_CLIENT_SECRET ? "[SET]" : "[MISSING]",
    gmail_redirect_uri: process.env.GMAIL_REDIRECT_URI ? "[SET]" : "[MISSING]",
    node_env: process.env.NODE_ENV,
    pwd: process.cwd(),
  });
}
