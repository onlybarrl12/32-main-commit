// Top nav config — 6 tabs, matching UXSAMPLE/SERPL_Budget_Portal_Demo.html
// (superseded the original 8-item left sidebar; see CLAUDE.md §3/§7).
// Audit Trail and Settings are NOT separate top-level items — they're
// sub-tabs inside Masters.
export type NavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/budgets/create", label: "Create" },
  { href: "/approvals", label: "Approve" },
  { href: "/reports", label: "Reports" },
  { href: "/admin/masters", label: "Masters", adminOnly: true },
  { href: "/admin/authorization", label: "Authorization", adminOnly: true },
];
