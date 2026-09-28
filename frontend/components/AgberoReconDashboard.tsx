"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Settings,
  Car,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ShieldCheck,
  Clock,
  LogOut,
  X,
  Phone,
  Radio,
  Printer,
  ChevronRight,
  Wallet,
  AlertTriangle,
} from "lucide-react";
import {
  Transaction,
  DashboardSummary,
  VehicleStatus,
  fetchDashboardSummary,
  fetchTransactions,
  fetchVehicleStatus,
  checkBackendHealth,
  getBaseApiUrl,
  DEFAULT_API_URL,
} from "@/lib/api";

const formatNaira = (amount: number): string => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatClock = (date: Date): string => {
  return date.toLocaleTimeString("en-US", {
    hour12: true,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

export default function AgberoReconDashboard() {
  // Live Ledger & KPI state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [kpis, setKpis] = useState<DashboardSummary>({
    date: new Date().toISOString().slice(0, 10),
    totalCollected: 0,
    paidCount: 0,
    unpaidCount: 0,
    plateCount: 0,
  });

  // Filters state (wired to backend query parameters)
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PAID" | "UNPAID">("ALL");
  const [dateFilter, setDateFilter] = useState<"today" | "all">("today");
  const [searchPlate, setSearchPlate] = useState<string>("");

  // Polling & connection state
  const [mounted, setMounted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [backendHealth, setBackendHealth] = useState<{
    ok: boolean;
    statusText: string;
    latencyMs: number;
  }>({ ok: true, statusText: "Online", latencyMs: 0 });

  // Verification & Detail Drawer
  const [showDrawer, setShowDrawer] = useState<boolean>(false);
  const [drawerPlate, setDrawerPlate] = useState<string>("LND-234-XY");
  const [drawerResult, setDrawerResult] = useState<VehicleStatus | null>(null);
  const [drawerLoading, setDrawerLoading] = useState<boolean>(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Settings Modal
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [customApiUrl, setCustomApiUrl] = useState<string>(DEFAULT_API_URL);

  // Mount effect & clock
  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date());
    setCustomApiUrl(getBaseApiUrl());
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Fetch live ledger and summary from Render backend
  const loadData = useCallback(async (showIndicator = false) => {
    if (showIndicator) setIsRefreshing(true);
    try {
      const [health, summaryRes, txRes] = await Promise.allSettled([
        checkBackendHealth(),
        fetchDashboardSummary(),
        fetchTransactions({
          status: statusFilter,
          date: dateFilter,
          limit: 50,
          plate: searchPlate.trim(),
        }),
      ]);

      if (health.status === "fulfilled") {
        setBackendHealth(health.value);
      }

      if (summaryRes.status === "fulfilled") {
        setKpis(summaryRes.value.summary);
      }

      if (txRes.status === "fulfilled") {
        setTransactions(txRes.value.transactions);
      }
    } catch {
      // ignore
    } finally {
      setIsRefreshing(false);
    }
  }, [statusFilter, dateFilter, searchPlate]);

  // Initial load and filter change
  useEffect(() => {
    loadData(true);
  }, [loadData]);

  // Polling interval (4 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => loadData(false), 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  // Perform live vehicle plate check
  const handleVerifyPlate = async (plateToCheck?: string) => {
    const target = (plateToCheck || drawerPlate).trim();
    if (!target) return;
    setDrawerPlate(target.toUpperCase());
    setDrawerLoading(true);
    setDrawerError(null);
    setDrawerResult(null);

    try {
      const res = await fetchVehicleStatus(target);
      setDrawerResult(res);
    } catch (err: unknown) {
      setDrawerError(err instanceof Error ? err.message : "Vehicle verification failed");
    } finally {
      setDrawerLoading(false);
    }
  };

  // Open drawer from a specific transaction row
  const openRowDetails = (tx: Transaction) => {
    setSelectedTx(tx);
    setDrawerPlate(tx.plateNumber);
    setShowDrawer(true);
    handleVerifyPlate(tx.plateNumber);
  };

  return (
    <div className="min-h-screen bg-[#F6F5F2] text-[#18181B] font-sans antialiased selection:bg-[#E2EAE4]">
      {/* 1. TOP HEADER */}
      <header className="border-b border-[#E3E6E2] bg-[#F6F5F2] sticky top-0 z-20">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-[#1B4D2E] text-white flex items-center justify-center shadow-xs">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <Link href="/dashboard" className="text-xl font-bold tracking-tight text-[#1B4D2E]">
                AgberoRecon
              </Link>
            </div>

            {/* Right Controls: Auto-refresh, Status, Clock, Settings, Logout */}
            <div className="flex items-center gap-2.5 sm:gap-3">
              {/* Auto Sync Toggle */}
              <button
                type="button"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                  autoRefresh
                    ? "bg-[#EBF0EC] text-[#1B4D2E] border-[#D5DDD6]"
                    : "bg-[#EFECE5] text-[#5B635E] border-[#E0DDD5]"
                }`}
                title="Toggle real-time ledger polling"
              >
                <Radio className={`h-3 w-3 ${autoRefresh ? "text-[#1B4D2E] animate-pulse" : "text-[#7A7871]"}`} />
                <span>Auto-sync: {autoRefresh ? "ON" : "OFF"}</span>
              </button>

              {/* Backend Status Pill */}
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#EBF0EC] text-[#1B4D2E] hover:bg-[#E2E8E3] transition-colors border border-[#D5DDD6] cursor-pointer"
                title="Click to view backend configuration"
              >
                <span className="w-2 h-2 rounded-full bg-[#15803D] animate-pulse" />
                <span className="font-mono text-[11px]">{backendHealth.latencyMs}ms</span>
              </button>

              {/* Park Clock */}
              <div className="hidden md:flex items-center gap-1.5 text-xs text-[#5B635E] font-mono border-l border-[#D5DDD6] pl-3">
                <Clock className="h-3.5 w-3.5 text-[#7A827D]" />
                <span>{mounted && currentTime ? formatClock(currentTime) : "--:--:--"}</span>
              </div>

              {/* Settings Gear */}
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-lg text-[#5B635E] hover:text-[#18181B] hover:bg-[#EBF0EC] transition-colors cursor-pointer"
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </button>

              {/* Sign Out */}
              <Link
                href="/login"
                className="p-2 rounded-lg text-[#5B635E] hover:text-[#B91C1C] hover:bg-[#FDECEE] transition-colors"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* 2. HERO BAR */}
      <section className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#163824]">
              Live Transactions
            </h1>
            <p className="text-xs sm:text-sm text-[#5B635E] mt-1">
              Real-time USSD transport levy collections and vehicle compliance checks.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isRefreshing}
              className="px-3.5 py-2.5 rounded-lg bg-[#EBF0EC] hover:bg-[#E2E8E3] text-[#18181B] text-xs font-semibold border border-[#D5DDD6] flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span>Sync</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedTx(null);
                setDrawerPlate("LND-234-XY");
                setShowDrawer(true);
                handleVerifyPlate("LND-234-XY");
              }}
              className="px-4 py-2.5 rounded-lg bg-[#1B4D2E] hover:bg-[#153E24] text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-98"
            >
              <Car className="h-3.5 w-3.5 text-white" />
              <span>Verify Vehicle</span>
            </button>
          </div>
        </div>
      </section>

      {/* 3. FUNCTIONAL STAT CARDS (White Cards on Canvas) */}
      <section className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Collected */}
          <div className="bg-white rounded-2xl p-5 border border-[#E3E6E2] shadow-xs flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-medium text-[#5B635E]">Total Collected Today</span>
              <div className="w-8 h-8 rounded-md bg-[#1B4D2E] text-white flex items-center justify-center">
                <Wallet className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl sm:text-3xl font-bold text-[#18181B] tracking-tight">
                {formatNaira(kpis.totalCollected)}
              </h3>
              <p className="text-[11px] text-[#5B635E] mt-1 font-mono">
                Fixed ₦500 / bus
              </p>
            </div>
          </div>

          {/* Buses Cleared (Paid) */}
          <div className="bg-white rounded-2xl p-5 border border-[#E3E6E2] shadow-xs flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-medium text-[#5B635E]">Buses Cleared</span>
              <div className="w-8 h-8 rounded-md bg-[#246B39] text-white flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl sm:text-3xl font-bold text-[#18181B] tracking-tight">
                {kpis.paidCount.toLocaleString()}
              </h3>
              <p className="text-[11px] text-[#1B4D2E] font-medium mt-1">
                Settled via USSD
              </p>
            </div>
          </div>

          {/* Disputes / Unpaid */}
          <div className="bg-white rounded-2xl p-5 border border-[#E3E6E2] shadow-xs flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-medium text-[#5B635E]">Disputes / Unpaid</span>
              <div className="w-8 h-8 rounded-md bg-[#B91C1C] text-white flex items-center justify-center">
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl sm:text-3xl font-bold text-[#18181B] tracking-tight">
                {kpis.unpaidCount.toLocaleString()}
              </h3>
              <p className="text-[11px] text-[#B91C1C] font-medium mt-1">
                Requires agent check
              </p>
            </div>
          </div>

          {/* Distinct Vehicles */}
          <div className="bg-white rounded-2xl p-5 border border-[#E3E6E2] shadow-xs flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-xs font-medium text-[#5B635E]">Unique Vehicles</span>
              <div className="w-8 h-8 rounded-md bg-[#18181B] text-white flex items-center justify-center">
                <Car className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4">
              <h3 className="text-2xl sm:text-3xl font-bold text-[#18181B] tracking-tight">
                {kpis.plateCount.toLocaleString()}
              </h3>
              <p className="text-[11px] text-[#5B635E] mt-1 font-mono">
                {kpis.date}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. TABLE CONTROLS BAR */}
      <section className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 pb-4">
        <div className="border-b border-[#E3E6E2] pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          {/* Plate Number Search */}
          <div className="flex items-center gap-2 text-xs text-[#5B635E] w-full sm:w-80 bg-[#EBF0EC] rounded-lg px-3.5 py-2.5 border border-[#D5DDD6] focus-within:border-[#1B4D2E] focus-within:bg-[#E4EBE5] transition-all">
            <Search className="h-3.5 w-3.5 text-[#7A827D] shrink-0" />
            <input
              type="text"
              placeholder="Filter by plate (e.g. LND-234-XY)..."
              value={searchPlate}
              onChange={(e) => setSearchPlate(e.target.value.toUpperCase())}
              className="bg-transparent border-none text-xs text-[#18181B] placeholder-[#8A918C] focus:outline-hidden w-full font-mono font-medium"
            />
            {searchPlate && (
              <button
                type="button"
                onClick={() => setSearchPlate("")}
                className="text-[#7A827D] hover:text-[#18181B] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Status & Date Filters */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* Status Pills */}
            <div className="flex items-center bg-[#EBF0EC] p-1 rounded-lg border border-[#D5DDD6]">
              {(["ALL", "PAID", "UNPAID"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setStatusFilter(opt)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    statusFilter === opt
                      ? "bg-white text-[#18181B] font-semibold shadow-xs"
                      : "text-[#5B635E] hover:text-[#18181B]"
                  }`}
                >
                  {opt === "ALL" ? "All" : opt === "PAID" ? "Paid" : "Unpaid"}
                </button>
              ))}
            </div>

            {/* Date Pills */}
            <div className="flex items-center bg-[#EBF0EC] p-1 rounded-lg border border-[#D5DDD6]">
              <button
                type="button"
                onClick={() => setDateFilter("today")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  dateFilter === "today"
                    ? "bg-white text-[#18181B] font-semibold shadow-xs"
                    : "text-[#5B635E] hover:text-[#18181B]"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDateFilter("all")}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  dateFilter === "all"
                    ? "bg-white text-[#18181B] font-semibold shadow-xs"
                    : "text-[#5B635E] hover:text-[#18181B]"
                }`}
              >
                All History
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 5. LEDGER TABLE */}
      <section className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="overflow-x-auto bg-white rounded-2xl border border-[#E3E6E2] shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="text-[#6B756F] font-medium border-b border-[#E3E6E2] bg-[#F9FAF9]">
                <th className="py-3.5 px-4 font-medium">Timestamp</th>
                <th className="py-3.5 px-4 font-medium">Vehicle Plate</th>
                <th className="py-3.5 px-4 font-medium">Handset Phone</th>
                <th className="py-3.5 px-4 font-medium">Status</th>
                <th className="py-3.5 px-4 font-medium">Levy Amount</th>
                <th className="py-3.5 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEFEA]">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="w-10 h-10 rounded-full bg-[#EBF0EC] flex items-center justify-center text-[#1B4D2E] mb-3">
                        <Car className="h-5 w-5" />
                      </div>
                      <h4 className="text-sm font-semibold text-[#18181B]">
                        No transactions recorded on ledger
                      </h4>
                      <p className="text-xs text-[#5B635E] mt-1">
                        Transactions will appear automatically as drivers dial USSD (*384*...) or enforcement agents verify vehicles.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTx(null);
                          setDrawerPlate("LND-234-XY");
                          setShowDrawer(true);
                          handleVerifyPlate("LND-234-XY");
                        }}
                        className="mt-4 px-3.5 py-2 bg-[#1B4D2E] hover:bg-[#153E24] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                      >
                        Verify Plate: LND-234-XY
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const isPaid = tx.status === "PAID";
                  return (
                    <tr
                      key={tx.id}
                      onClick={() => openRowDetails(tx)}
                      className="hover:bg-[#F6F8F6] transition-colors cursor-pointer"
                    >
                      {/* Timestamp */}
                      <td className="py-4 px-4 font-mono text-[#5B635E]">
                        <div>{tx.localTime || new Date(tx.createdAt).toLocaleTimeString()}</div>
                        <div className="text-[10px] text-[#8A918C]">
                          {tx.localDate || new Date(tx.createdAt).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Vehicle Plate */}
                      <td className="py-4 px-4">
                        <span className="font-mono font-bold text-sm text-[#18181B]">
                          {tx.plateNumber}
                        </span>
                      </td>

                      {/* Handset Phone */}
                      <td className="py-4 px-4 font-mono text-[#5B635E]">
                        {tx.phone || "—"}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            isPaid
                              ? "bg-[#E6F0E8] text-[#1B4D2E] border border-[#CDE0D1]"
                              : "bg-[#FDECEE] text-[#991B1B] border border-[#F8D2D6]"
                          }`}
                        >
                          {isPaid ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" />
                              PAID
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3" />
                              UNPAID
                            </>
                          )}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="py-4 px-4 font-bold text-[#18181B] font-mono">
                        {formatNaira(tx.amount || 500)}
                      </td>

                      {/* Action */}
                      <td className="py-4 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openRowDetails(tx);
                          }}
                          className="text-xs font-semibold text-[#1B4D2E] hover:text-[#153E24] inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <span>Verify</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. SLIDE-OVER VEHICLE VERIFICATION & SETTLEMENT DETAIL DRAWER */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[#0A1610]/35 backdrop-blur-2xs transition-opacity"
            onClick={() => setShowDrawer(false)}
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl z-10 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-250 border-l border-[#E3E6E2]">
            <div>
              {/* Header */}
              <div className="p-6 border-b border-[#E3E6E2] flex justify-between items-center">
                <h3 className="text-base font-bold text-[#163824]">
                  Vehicle Verification
                </h3>
                <button
                  type="button"
                  onClick={() => setShowDrawer(false)}
                  className="text-[#6B756F] hover:text-[#18181B] p-1 rounded-md cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-5">
                {/* Search / Plate Input */}
                <div>
                  <label className="block text-xs font-medium text-[#18181B] mb-1.5">
                    Vehicle Plate Number
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={drawerPlate}
                      onChange={(e) => setDrawerPlate(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === "Enter" && handleVerifyPlate()}
                      placeholder="e.g. LND-234-XY"
                      className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#EBF0EC] text-xs font-mono font-semibold text-[#18181B] border border-transparent focus:border-[#1B4D2E] focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => handleVerifyPlate()}
                      disabled={drawerLoading}
                      className="px-4 py-2.5 rounded-lg bg-[#1B4D2E] text-white text-xs font-semibold hover:bg-[#153E24] disabled:opacity-50 cursor-pointer transition-colors"
                    >
                      {drawerLoading ? "Checking..." : "Check"}
                    </button>
                  </div>
                </div>

                {/* Quick Chips */}
                <div className="flex items-center gap-1.5 flex-wrap text-xs text-[#5B635E]">
                  <span>Seeded demo plates:</span>
                  {["LND-234-XY", "KJA-892-BC", "APP-552-XY", "UNREG-99"].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        setDrawerPlate(chip);
                        handleVerifyPlate(chip);
                      }}
                      className="px-2 py-0.5 rounded-md bg-[#EBF0EC] text-[#1B4D2E] font-mono text-[11px] hover:bg-[#E2E8E3] cursor-pointer"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {/* Live Verification Result Box */}
                {drawerResult && (
                  <div className="p-5 rounded-xl bg-[#F6F5F2] border border-[#E3E6E2] space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Car className="h-5 w-5 text-[#1B4D2E]" />
                        <span className="font-mono text-base font-bold text-[#18181B]">
                          {drawerResult.plateNumber}
                        </span>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          drawerResult.status === "PAID"
                            ? "bg-[#E6F0E8] text-[#1B4D2E] border border-[#CDE0D1]"
                            : "bg-[#FDECEE] text-[#991B1B] border border-[#F8D2D6]"
                        }`}
                      >
                        {drawerResult.status}
                      </span>
                    </div>

                    <div className="space-y-2.5 text-xs text-[#5B635E] pt-3 border-t border-[#E3E6E2]">
                      <div className="flex justify-between">
                        <span>Wallet Registration:</span>
                        <span className="font-semibold text-[#18181B]">
                          {drawerResult.registered ? "Registered in Wallet" : "Unregistered"}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span>Daily Levy Amount:</span>
                        <span className="font-semibold text-[#18181B] font-mono">
                          ₦500.00
                        </span>
                      </div>

                      {drawerResult.paidAt && (
                        <div className="flex justify-between">
                          <span>Settled At:</span>
                          <span className="font-mono text-[#18181B]">
                            {new Date(drawerResult.paidAt).toLocaleTimeString()}
                          </span>
                        </div>
                      )}

                      <div className="flex justify-between">
                        <span>Verified At:</span>
                        <span className="font-mono text-[#8A918C]">
                          {new Date(drawerResult.checkedAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>

                    {selectedTx && (
                      <div className="pt-3 border-t border-[#E3E6E2] text-xs space-y-1">
                        <div className="text-[#8A918C]">Handset Phone:</div>
                        <div className="font-mono text-[#18181B] font-semibold">{selectedTx.phone}</div>
                      </div>
                    )}
                  </div>
                )}

                {drawerError && (
                  <div className="p-3.5 rounded-lg bg-[#FDECEE] text-[#991B1B] text-xs border border-[#F8D2D6]">
                    {drawerError}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-[#E3E6E2] flex gap-3">
              <button
                type="button"
                onClick={() => setShowDrawer(false)}
                className="flex-1 py-2.5 rounded-lg border border-[#D5DDD6] text-xs font-semibold text-[#18181B] hover:bg-[#F6F5F2] cursor-pointer"
              >
                Close
              </button>
              {drawerResult?.status === "PAID" && (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 py-2.5 rounded-lg bg-[#1B4D2E] hover:bg-[#153E24] text-xs font-semibold text-white cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print Slip</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. BACKEND SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-[#0A1610]/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-[#E3E6E2]">
            <div className="flex justify-between items-center border-b border-[#E3E6E2] pb-3">
              <h3 className="text-sm font-bold text-[#163824]">Backend Integration Settings</h3>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="text-[#6B756F] hover:text-[#18181B] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="text-xs space-y-3">
              <div>
                <label className="block font-medium text-[#18181B] mb-1">API Base URL</label>
                <input
                  type="text"
                  value={customApiUrl}
                  onChange={(e) => setCustomApiUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#EBF0EC] text-xs font-mono text-[#18181B] border border-[#D5DDD6] focus:border-[#1B4D2E] focus:outline-hidden"
                />
              </div>
              <div className="p-3 rounded-lg bg-[#F6F5F2] space-y-1 text-[#5B635E] border border-[#E3E6E2]">
                <div className="flex justify-between">
                  <span>Server Status:</span>
                  <span className="font-semibold text-[#15803D]">{backendHealth.statusText}</span>
                </div>
                <div className="flex justify-between">
                  <span>Roundtrip Latency:</span>
                  <span className="font-mono text-[#18181B]">{backendHealth.latencyMs} ms</span>
                </div>
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 rounded-lg bg-[#1B4D2E] hover:bg-[#153E24] text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
