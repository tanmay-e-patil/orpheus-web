"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sidebar } from "@/components/sidebar";
import { cn } from "@/lib/utils";

export default function MobileNav({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        "md:hidden sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b",
        className
      )}
    >
      <div className="h-12 flex items-center px-3 gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          onClick={() => setOpen(true)}
          className="h-10 w-10"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </Button>
        <span className="font-semibold">Orpheus</span>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="p-0 gap-0 max-w-none w-[100vw] h-[100dvh] top-0 left-0 translate-x-0 translate-y-0 rounded-none border-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="w-full h-full flex">
            <aside className="w-72 max-w-[85vw] h-full border-r bg-background">
              <Sidebar className="h-dvh md:h-full md:sticky md:top-0 overflow-y-auto" />
            </aside>
            <div className="flex-1" onClick={() => setOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
