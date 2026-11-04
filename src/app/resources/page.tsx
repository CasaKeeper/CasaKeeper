import ProtectedApp from "@/components/auth/protected-app";
import { AuthLoading } from "@/components/auth/auth-shell";
import { Suspense } from "react";

export const instant = false;

export default function ResourcesPage() {
  return <Suspense fallback={<AuthLoading />}><ProtectedApp /></Suspense>;
}
