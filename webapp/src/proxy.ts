export { auth as proxy } from "@/auth";

// Protect everything except the login page, the NextAuth API routes, and
// Next's static/internal assets. Actual authorization (which is
// unauthenticated vs. logged-in-but-wrong-role) is decided by
// callbacks.authorized in src/auth.ts.
//
// Named `proxy.ts` per Next.js 16's rename of the `middleware` file
// convention (https://nextjs.org/docs/messages/middleware-to-proxy) — we're
// on Next 16 (see CLAUDE.md §3), so we follow the current convention rather
// than the deprecated one.
export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
