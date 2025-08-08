"use client";
import { useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePlayerStore } from "@/lib/player/store";
import LyricsView from "./LyricsView";

export default function MobileLyricsOverlay() {
  const open = usePlayerStore((s) => s.isLyricsOverlayOpen ?? false);
  const close = usePlayerStore((s) => s.closeLyricsOverlay!);
  const now = usePlayerStore((s) => s.queue[s.currentIndex]);
  const lastActiveRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      lastActiveRef.current = document.activeElement as HTMLElement;
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? close() : void 0)}>
      <DialogContent className="md:hidden p-0 gap-0 max-w-none w-[100vw] h-[100dvh] top-0 left-0 translate-x-0 translate-y-0 rounded-none border-0">
        <div className="w-full h-full flex flex-col bg-background">
          <div className="flex items-center justify-between h-12 px-3 sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">
                {now?.name ?? "Lyrics"}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {now?.artistName ?? ""}
              </div>
            </div>
            <Button
              aria-label="Close"
              variant="ghost"
              size="icon"
              onClick={close}
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <LyricsView />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
