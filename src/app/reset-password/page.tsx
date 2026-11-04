import { ResetPasswordForm } from "@/components/auth/auth-form";
import { requireUser } from "@/lib/supabase/auth";
import { AuthLoading } from "@/components/auth/auth-shell";
import { Suspense } from "react";

export const instant = false;

async function ResetPasswordGate() { await requireUser("/reset-password"); return <ResetPasswordForm />; }
export default function ResetPasswordPage() { return <Suspense fallback={<AuthLoading />}><ResetPasswordGate /></Suspense>; }
