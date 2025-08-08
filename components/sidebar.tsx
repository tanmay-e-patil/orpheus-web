"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { authClient } from "@/lib/auth-client";
import { toastInfo, toastError } from "@/lib/toast";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Sidebar({ className }: SidebarProps) {
  const router = useRouter();

  async function handleSignOut() {
    try {
      await authClient.signOut();
      toastInfo("Signed out");
      router.push("/");
      router.refresh();
    } catch (e) {
      toastError("Failed to sign out");
      console.error(e);
    }
  }

  return (
    <ScrollArea>
      <div className={cn("pb-12", className)}>
        <div className="space-y-4 py-4 px-4">
          <div className="px-3 py-2">
            <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
              Library
            </h2>
            <div className="space-y-1">
              <Button
                asChild
                variant="outline"
                className="w-full justify-start"
              >
                <Link href="/home">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-2 h-4 w-4"
                  >
                    <circle cx="8" cy="18" r="4" />
                    <path d="M12 18V2l7 4" />
                  </svg>
                  Tracks
                </Link>
              </Button>
            </div>
          </div>
          <div className="px-3 py-2">
            <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
              Explore
            </h2>
            <div className="space-y-1">
              <Button
                asChild
                variant="outline"
                className="w-full justify-start"
              >
                <Link href="/discover">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-2 h-4 w-4"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="m22 19-2-2 2-2" />
                  </svg>
                  Discover
                </Link>
              </Button>
            </div>
          </div>
          <div className="px-3 py-2">
            <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
              Account
            </h2>
            <div className="space-y-1">
              <Button
                variant="ghost"
                className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                onClick={handleSignOut}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-2 h-4 w-4"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" x2="9" y1="12" y2="12" />
                </svg>
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
