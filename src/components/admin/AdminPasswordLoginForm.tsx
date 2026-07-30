"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormValues = {
  email: string;
  password: string;
};

export function AdminPasswordLoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  async function onSubmit(values: FormValues) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.email.trim().toLowerCase(),
          password: values.password,
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error ?? "登录失败，请重试");
        return;
      }
      router.push("/admin/analytics");
      router.refresh();
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md border-border/80 bg-card/45 shadow-sm backdrop-blur-md">
      <CardHeader>
        <CardTitle className="text-xl">数据分析后台</CardTitle>
        <CardDescription>请使用管理员邮箱和密码登录</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="admin-email">邮箱</Label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="email"
              {...register("email", { required: "请输入邮箱" })}
              placeholder="your@email.com"
              className="h-10"
            />
            {errors.email ? (
              <p className="text-destructive text-xs">{errors.email.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">密码</Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              {...register("password", { required: "请输入密码" })}
              placeholder="••••••••"
              className="h-10"
            />
            {errors.password ? (
              <p className="text-destructive text-xs">{errors.password.message}</p>
            ) : null}
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                登录中...
              </span>
            ) : (
              "登录"
            )}
          </Button>
          {error ? <p className="text-destructive text-sm text-center">{error}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
