"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

export function TabNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="portal-nav mx-auto flex max-w-[1440px] overflow-x-auto px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
      {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={"portal-nav-link whitespace-nowrap px-3 py-3 text-sm " + (active ? "portal-nav-link-active" : "")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
