"use client";
import { toast } from "sonner";

export function toastError(msg: string) {
  toast.error(msg);
}

export function toastInfo(msg: string) {
  toast.info(msg);
}
