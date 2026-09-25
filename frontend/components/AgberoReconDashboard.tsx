"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Clock,
  LayoutDashboard,
  Car,
  AlertTriangle,
  ShieldCheck,
  Activity,
  CheckCircle2,
  XCircle,
  LogOut,
} from "lucide-react";

export interface Transaction {
  id: string;
  timestamp: Date;
  plateNumber: string;
  agentId: string;
  amount: number;
  status: "PAID" | "UNPAID";
  isNew: boolean;
}

export interface DashboardKPIs {
  totalCollected: number;
  busesCleared: number;
  disputes: number;
}

// Utility to generate realistic Lagos plate numbers
const generatePlateNumber = (): string => {
  const lgas = ["LND", "KJA", "EKY", "APP", "SMK", "BDG", "AAA", "MUS", "GGE"];
  const lga = lgas[Math.floor(Math.random() * lgas.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  const letters =
    String.fromCharCode(65 + Math.floor(Math.random() * 26)) +
    String.fromCharCode(65 + Math.floor(Math.random() * 26));
  return `${lga}-${num}-${letters}`;
};

// Utility to generate mock transactions
const createMockTransaction = (id?: string): Transaction => {
  const isPaid = Math.random() > 0.15; // 85% chance of being paid
  return {
    id: id || `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date(),
    plateNumber: generatePlateNumber(),
    agentId: `AG-${(Math.floor(Math.random() * 90) + 10).toString().padStart(3, "0")}`,
    amount: 500, // Standard daily levy
    status: isPaid ? "PAID" : "UNPAID",
    isNew: true, // Flag for animation
  };
};

const formatNaira = (amount: number): string => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatTime = (date: Date): string => {
  return date.toLocaleTimeString("en-US", {
    hour12: true,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export default function AgberoReconDashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [kpis, setKpis] = useState<DashboardKPIs>({
    totalCollected: 142500,
    busesCleared: 285,
    disputes: 3,
  });
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [mounted, setMounted] = useState<boolean>(false);

  // Clock effect and mounted check for hydration consistency
  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Initial data load and Simulation effect
  useEffect(() => {
    // Generate initial historical data
    const initialData: Transaction[] = Array.from({ length: 10 })
      .map((_, i) => ({
        ...createMockTransaction(`init-${i}`),
        timestamp: new Date(Date.now() - (10 - i) * 60000), // past minutes
        isNew: false,
      }))
      .reverse();
    setTransactions(initialData);

    // Live incoming data simulation
    const liveInterval = setInterval(() => {
      const newTx = createMockTransaction();

      setTransactions((prev) => {
        const updated = [newTx, ...prev];
        // Keep memory clean, store max 50 rows
        return updated.slice(0, 50);
      });

      // Update KPIs
      setKpis((prev) => {
        if (newTx.status === "PAID") {
          return {
            ...prev,
            totalCollected: prev.totalCollected + newTx.amount,
            busesCleared: prev.busesCleared + 1,
          };
        } else {
          return { ...prev, disputes: prev.disputes + 1 };
        }
      });
    }, 3000);

    return () => clearInterval(liveInterval);
  }, []);

  // Custom styles for row flashing animation and custom scrollbars
  const styleSheet = `
    @keyframes flashHighlight {
      0% { background-color: #dcfce7; }
      10% { background-color: #bbf7d0; }
      100% { background-color: transparent; }
    }
    @keyframes flashError {
      0% { background-color: #fee2e2; }
      10% { background-color: #fecaca; }
      100% { background-color: transparent; }
    }
    .animate-flash-paid {
      animation: flashHighlight 2.5s ease-out forwards;
    }
    .animate-flash-unpaid {
      animation: flashError 2.5s ease-out forwards;
    }
    .table-scrollbar::-webkit-scrollbar {
      width: 6px;
    }
    .table-scrollbar::-webkit-scrollbar-track {
      background: #f1f5f9; 
    }
    .table-scrollbar::-webkit-scrollbar-thumb {
      background: #cbd5e1; 
      border-radius: 4px;
    }
    .table-scrollbar::-webkit-scrollbar-thumb:hover {
      background: #94a3b8; 
    }
  `;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <style>{styleSheet}</style>

      {/* Top Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="bg-green-700 p-2 rounded-md">
                <ShieldCheck className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">AgberoRecon</h1>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                  Transport Levy Settlement
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full border border-slate-200 text-sm font-medium text-slate-700">
                <Activity className="h-4 w-4 text-green-600 animate-pulse" />
                <span className="hidden sm:inline">System Live</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600 border-l border-slate-200 pl-4">
                <Clock className="h-5 w-5" />
                <span className="font-mono text-sm font-medium">
                  {mounted && currentTime ? formatTime(currentTime) : "--:--:--"}
                </span>
              </div>
              <Link
                href="/login"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-red-700 bg-slate-100 hover:bg-red-50 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                title="Sign out to authentication portal"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Sign Out</span>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* KPI Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500">Total Collected Today</p>
                <h2 className="text-3xl font-bold text-slate-900 mt-1">
                  {formatNaira(kpis.totalCollected)}
                </h2>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <BanknotesIcon className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm text-green-600 font-medium">
              <span>Settlement sync pending for 11:59 PM</span>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500">Buses Cleared</p>
                <h2 className="text-3xl font-bold text-slate-900 mt-1">
                  {kpis.busesCleared.toLocaleString()}
                </h2>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <Car className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm text-slate-500">
              <span>Verified across 14 active zones</span>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500">Disputes / Unpaid</p>
                <h2 className="text-3xl font-bold text-slate-900 mt-1">{kpis.disputes}</h2>
              </div>
              <div className="bg-red-50 p-3 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm text-slate-500">
              <span>Requires agent intervention</span>
            </div>
          </div>
        </section>

        {/* Live Transaction Ledger */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
            <div className="flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5 text-slate-400" />
              <h3 className="text-lg font-semibold text-slate-900">Live Transaction Ledger</h3>
            </div>
            <span className="text-xs font-medium bg-slate-200 text-slate-600 px-2.5 py-1 rounded-full">
              Updating real-time via USSD
            </span>
          </div>

          <div className="overflow-x-auto max-h-[600px] table-scrollbar">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th scope="col" className="px-6 py-3 font-semibold text-slate-500">
                    Timestamp
                  </th>
                  <th scope="col" className="px-6 py-3 font-semibold text-slate-500">
                    Plate Number
                  </th>
                  <th scope="col" className="px-6 py-3 font-semibold text-slate-500">
                    Agent ID
                  </th>
                  <th scope="col" className="px-6 py-3 font-semibold text-slate-500">
                    Amount
                  </th>
                  <th scope="col" className="px-6 py-3 font-semibold text-slate-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                      Waiting for USSD gateway connections...
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className={`hover:bg-slate-50 transition-colors duration-150 ${
                        tx.isNew
                          ? tx.status === "PAID"
                            ? "animate-flash-paid"
                            : "animate-flash-unpaid"
                          : ""
                      }`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-slate-500 font-mono text-xs">
                        {formatTime(tx.timestamp)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">
                        {tx.plateNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600">{tx.agentId}</td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-700">
                        {formatNaira(tx.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {tx.status === "PAID" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            PAID
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
                            <XCircle className="h-3.5 w-3.5" />
                            UNPAID
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

// Icon helper for Banknotes
function BanknotesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
      />
    </svg>
  );
}
