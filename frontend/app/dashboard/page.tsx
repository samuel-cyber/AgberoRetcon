import type { Metadata } from "next";
import AgberoReconDashboard from "@/components/AgberoReconDashboard";

export const metadata: Metadata = {
  title: "Live Settlement Dashboard | AgberoRecon",
  description: "Real-time transport levy settlement ledger, USSD transaction stream, and reconciliation KPIs.",
};

export default function DashboardPage() {
  return <AgberoReconDashboard />;
}
