import { Button } from "@/components/ui/button";
import { Metadata } from "next";
import { PlusCircledIcon } from "@radix-ui/react-icons";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Music App",
  description: "Example music app using the components.",
};

export default function MusicPage() {
  return (
    <>
      <div className="w-full space-y-4 py-4 px-4">
        <div className="px-3 py-2 flex justify-between">
          <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
            All tracks
          </h2>
          <Link href="/search">
            <Button className="mb-2 px-4 font-semibold tracking-tight">
              <PlusCircledIcon />
              Add music
            </Button>
          </Link>
        </div>
      </div>
    </>
  );
}
