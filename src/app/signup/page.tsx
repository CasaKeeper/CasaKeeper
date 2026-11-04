import { redirectAuthenticated } from "@/lib/supabase/auth";
import { SignupForm } from "@/components/auth/auth-form";
import { AuthLoading } from "@/components/auth/auth-shell";
import { Suspense } from "react";

export const instant = false;

async function SignupGate({ searchParams }: { searchParams: Promise<{ next?: string }> }) { const params = await searchParams; await redirectAuthenticated(params.next); return <SignupForm />; }
export default function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) { return <Suspense fallback={<AuthLoading />}><SignupGate searchParams={searchParams} /></Suspense>; }
