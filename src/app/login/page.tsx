import { redirectAuthenticated } from "@/lib/supabase/auth";
import { LoginForm } from "@/components/auth/auth-form";
import { AuthLoading } from "@/components/auth/auth-shell";
import { Suspense } from "react";

export const instant = false;

async function LoginGate({ searchParams }: { searchParams: Promise<{ next?: string }> }) { const params = await searchParams; await redirectAuthenticated(params.next); return <LoginForm />; }
export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) { return <Suspense fallback={<AuthLoading />}><LoginGate searchParams={searchParams} /></Suspense>; }
