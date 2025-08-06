// "use client";

import { auth } from "@/lib/auth";
import { LoginForm } from "./_components/LoginForm";
import { env } from "@/lib/env";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  async function signUpWithUsername() {
    const response = await auth.api.isUsernameAvailable({
      body: {
        username: env.AUTH_USERNAME,
      },
    });
    if (!response.available) {
      console.log("Username is not available");
    } else {
      console.log("Username is available. Completing first time sign up.");
      const signUpResponse = await auth.api.signUpEmail({
        body: {
          email: env.AUTH_EMAIL,
          password: env.AUTH_PASSWORD,
          username: env.AUTH_USERNAME,
          name: env.AUTH_NAME,
        },
      });
      if (signUpResponse.user === null) {
        console.error("Sign up failed:");
      } else {
        console.log("Sign up successful");
      }
    }
  }
  await signUpWithUsername();
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    redirect("/home");
  }
  return (
    <div className="">
      <LoginForm />
    </div>
  );
}
