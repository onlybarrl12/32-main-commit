import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/Topbar";
import { ROLE_LABELS } from "@/lib/labels";

// Auth guard here is defense-in-depth alongside src/proxy.ts (which already
// redirects unauthenticated requests to /login) — this is what actually
// loads the user + access grants for the topbar/nav and for every page
// under this route group to read via getCurrentUser().
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isAdmin = user.access.some((a) => a.role === "ADMIN");
  const roleSummary =
    [...new Set(user.access.map((a) => ROLE_LABELS[a.role]))].join(", ") || "No roles assigned";
  const pendingResetCount = isAdmin ? await prisma.passwordResetRequest.count({ where: { resolvedAt: null } }) : 0;

  return (
    <div className="portal-shell min-h-screen">
      <Topbar username={user.username} roleSummary={roleSummary} isAdmin={isAdmin} pendingResetCount={pendingResetCount} />
      <main className="portal-content mx-auto w-full px-4 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
