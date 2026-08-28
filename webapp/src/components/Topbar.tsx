import Image from "next/image";
import Link from "next/link";
import { signOut } from "@/auth";
import { TabNav } from "./TabNav";

export function Topbar({
  username,
  roleSummary,
  isAdmin,
  pendingResetCount = 0,
}: {
  username: string;
  roleSummary: string;
  isAdmin: boolean;
  pendingResetCount?: number;
}) {
  const initials = username.trim().slice(0, 1).toUpperCase() || "U";

  return (
    <header className="portal-header">
      <div className="portal-header__stripe" />
      <div className="portal-header__main mx-auto flex max-w-[1440px] items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="portal-brand" aria-label="SERPL Budget Portal home">
          <Image
            src="/brand/indianoil-logo.png"
            alt="IndianOil"
            width={42}
            height={42}
            className="portal-brand-logo"
            priority
          />
          <div className="min-w-0 leading-tight">
            <div className="portal-wordmark">SERPL Budget Portal</div>
            <div className="portal-subtitle">R&amp;M PLANNING &amp; CONTROL · SOUTH EASTERN REGION</div>
          </div>
        </Link>

        <div className="portal-user">
          {isAdmin && (
            <Link
              href="/admin/password-resets"
              className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand-orange"
              aria-label="Password reset requests"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M10 21h4" />
              </svg>
              {pendingResetCount > 0 && (
                <span className="absolute right-0.5 top-0.5 min-w-[16px] rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
                  {pendingResetCount}
                </span>
              )}
            </Link>
          )}
          <div className="portal-user-avatar" aria-hidden="true">{initials}</div>
          <div className="portal-user-meta text-right">
            <div className="portal-user-name">{username}</div>
            <div className="portal-user-role">{roleSummary}</div>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="portal-signout px-3 py-2 text-xs font-semibold">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <TabNav isAdmin={isAdmin} />
    </header>
  );
}
