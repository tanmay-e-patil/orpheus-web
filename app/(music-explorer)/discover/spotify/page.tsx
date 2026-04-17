import type React from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import SpotifyMatching from "./_components/SpotifyMatching";

export default async function SpotifyMatchingPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/");
  }

  return (
    <main className="container mx-auto py-6 px-4 sm:px-6">
      <Link href="/home">
        <h1 className="text-3xl font-bold mb-8 text-center">Orpheus</h1>
      </Link>
      <div className="max-w-screen-md mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold mb-4">
            Stage 2: Deezer Matching
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Enrich your selected videos with structured track metadata from Deezer
          </p>
        </div>
        <SpotifyMatching />
      </div>
    </main>
  );
}
