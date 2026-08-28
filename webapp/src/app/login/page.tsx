import Image from "next/image";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Incorrect username or password.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const { error } = await searchParams;

  async function loginAction(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        username: formData.get("username"),
        password: formData.get("password"),
        redirectTo: "/",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect(`/login?error=${err.type}`);
      }
      throw err;
    }
  }

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-full bg-white ring-2 ring-brand-orange flex items-center justify-center mb-3 overflow-hidden shadow-sm">
            <Image src="/brand/indianoil-logo.png" alt="IndianOil" width={48} height={48} priority />
          </div>
          <div className="text-lg font-bold text-brand-navy tracking-tight">SERPL Budget Portal</div>
          <div className="text-xs text-brand-orange font-medium text-center mt-1">
            IOCL South Eastern Region Pipelines
          </div>
        </div>

        <form
          action={loginAction}
          className="bg-white rounded-xl border-t-4 border-t-brand-orange border-x border-b border-x-stone-200 border-b-stone-200 p-6 space-y-4"
        >
          {error && (
            <p className="text-xs text-red-600">{ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again."}</p>
          )}
          <div>
            <label htmlFor="username" className="text-xs font-medium text-stone-500 block mb-1">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoFocus
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-xs font-medium text-stone-500 block mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-brand-orange px-3 py-2 text-sm font-medium text-white hover:bg-brand-orange-dark"
          >
            Sign in
          </button>
        </form>

        <div className="text-center mt-3">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
