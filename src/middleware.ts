import { clerkMiddleware } from "@clerk/nextjs/server";

// Makes the Clerk session readable on every request. Access rules stay in the
// app: operator routes check the desk session, customer links and Twilio
// webhooks stay public and carry their own signatures.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
