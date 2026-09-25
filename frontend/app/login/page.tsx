import type { Metadata } from "next";
import AgberoAuth from "@/components/AgberoAuth";

export const metadata: Metadata = {
  title: "Sign In / Register | AgberoRecon",
  description: "Transport Levy Settlement & Verification Portal - Sign in or register an administrative account.",
};

export default function LoginPage() {
  return <AgberoAuth />;
}
