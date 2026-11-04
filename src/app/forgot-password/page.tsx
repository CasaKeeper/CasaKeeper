import { redirectAuthenticated } from "@/lib/supabase/auth";
import { ForgotPasswordForm } from "@/components/auth/auth-form";
import { AuthLoading } from "@/components/auth/auth-shell";
import { Suspense } from "react";

export const instant = false;

async function ForgotPasswordGate() { await redirectAuthenticated(); return <ForgotPasswordForm />; }
export default function ForgotPasswordPage() { return <Suspense fallback={<AuthLoading />}><ForgotPasswordGate /></Suspense>; }
