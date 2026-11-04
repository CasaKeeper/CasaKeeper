import OnboardingForm from "@/components/auth/onboarding-form";
import { AuthLoading } from "@/components/auth/auth-shell";
import { requireUser } from "@/lib/supabase/auth";
import { Suspense } from "react";

export const instant = false;

async function OnboardingGate() {
  await requireUser("/onboarding");
  return <OnboardingForm />;
}

export default function OnboardingPage() { return <Suspense fallback={<AuthLoading />}><OnboardingGate /></Suspense>; }
