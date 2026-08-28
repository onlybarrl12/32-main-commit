import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/rbac";

// Server-side enforcement for all /admin/* routes — the sidebar already
// hides these links from non-admins (see Sidebar.tsx), but that's cosmetic
// only. This is the actual authorization check.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const isAdmin = user?.access.some((a) => a.role === "ADMIN") ?? false;
  if (!isAdmin) redirect("/");

  return <>{children}</>;
}
