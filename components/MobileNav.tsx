"use client";

import { cn } from "@/lib/utils";
import { SidebarTrigger } from "@/components/ui/sidebar";

export default function MobileNav({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b",
        className
      )}
    >
      <div className="h-12 flex items-center px-3 gap-3">
        <SidebarTrigger />
        <span className="font-semibold md:hidden">Orpheus</span>
      </div>
    </div>
  );
}
