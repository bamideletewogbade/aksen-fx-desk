import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Makes the Clerk session readable on every request. Access rules stay in the
// app: operator routes check the desk session, customer links and Twilio
// webhooks stay public and carry their own signatures.
const clerkConfigured = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default clerkConfigured ? clerkMiddleware() : function middleware() {
  return NextResponse.next();
};

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
