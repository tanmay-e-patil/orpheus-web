"use client";
import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
      <DialogTitle className="sr-only" />
      <DialogContent className="md:hidden p-0 gap-0 max-w-none w-full h-[100dvh] top-0 left-0 translate-x-0 translate-y-0 rounded-none border-0">
        <div className="w-full h-full flex flex-col justify-center items-center bg-background">
          <div className="overflow-y-auto">
            <LyricsView />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
