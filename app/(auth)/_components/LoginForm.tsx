"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

interface LoginFormProps {
  username: string;
  password: string;
}

export function LoginForm() {
  const [loginForm, setLoginForm] = useState<LoginFormProps>({
    username: "",
    password: "",
  });
  const router = useRouter();

  const [formPending, formTransition] = useTransition();

  async function signInWithEmail() {
    formTransition(() => {
      authClient.signIn.username({
        username: loginForm.username,
        password: loginForm.password,
        fetchOptions: {
          onSuccess: () => {
            toast.success("Signed in successfully. You will be redirected...");
            router.push("/home");
          },
          onError: () => {
            toast.error("Internal Server Error");
          },
        },
      });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Welcome back!</CardTitle>
        <CardDescription>Login with Account</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 ">
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="username">Username</Label>
            <Input
              type="username"
              placeholder="your_username"
              value={loginForm.username}
              onChange={(e) =>
                setLoginForm({ ...loginForm, username: e.target.value })
              }
              required
            ></Input>
            <Label htmlFor="password">Password</Label>
            <Input
              type="password"
              placeholder="********"
              value={loginForm.password}
              onChange={(e) =>
                setLoginForm({ ...loginForm, password: e.target.value })
              }
              required
            ></Input>
          </div>

          <Button onClick={signInWithEmail} disabled={formPending}>
            Login
            {formPending && (
              <div>
                <Loader2 className="size-4 animate-spin"></Loader2>
              </div>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
