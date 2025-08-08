"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { toastError, toastInfo } from "@/lib/toast";
import { Music } from "lucide-react";

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Sidebar({ className }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = React.useState<string>(searchParams.get("q") ?? "");
  const debouncedRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    // keep local input in sync if URL changes elsewhere
    const urlQ = searchParams.get("q") ?? "";
    setQuery((prev) => (prev !== urlQ ? urlQ : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  function updateUrl(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.trim()) params.set("q", next.trim());
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function onSearchChange(v: string) {
    setQuery(v);
    if (debouncedRef.current) clearTimeout(debouncedRef.current);
    debouncedRef.current = setTimeout(() => updateUrl(v), 250);
  }

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
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
          <div className="px-4 py-3 flex items-center gap-2">
            <Link href="/home" className="flex items-center gap-2">
              <Music className="h-4 w-4 rounded-full" />
              <span className="font-bold">Orpheus</span>
            </Link>
          </div>
          <div className="px-2 pb-2">
            <Input
              value={query}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by title, artist, album"
            />
          </div>
        </div>

        <div>
          <div>
            <div>
              <Link
                href="/home"
                className={buttonVariants({
                  variant: "outline",
                  size: "sm",
                  className: cn(
                    "w-full rounded-none border-t border-b flex items-center justify-start"
                  ),
                })}
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
                  <circle cx="8" cy="18" r="4" />
                  <path d="M12 18V2l7 4" />
                </svg>
                Tracks
              </Link>
            </div>
          </div>

          <div className="">
            <div>
              <Link
                href="/discover"
                className={buttonVariants({
                  variant: "outline",
                  size: "sm",
                  className: cn(
                    "w-full rounded-none border-t border-b flex items-center justify-start"
                  ),
                })}
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
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="m22 19-2-2 2-2" />
                </svg>
                Discover
              </Link>
            </div>
          </div>

          <div>
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
