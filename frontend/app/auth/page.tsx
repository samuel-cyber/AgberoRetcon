import type { Metadata } from "next";
import AgberoAuth from "@/components/AgberoAuth";

export const metadata: Metadata = {
  title: "Authentication | AgberoRecon",
  description: "Transport Levy Settlement & Verification Portal - Sign in or register an administrative account.",
};

export default function AuthPage() {
  return <AgberoAuth />;
}
