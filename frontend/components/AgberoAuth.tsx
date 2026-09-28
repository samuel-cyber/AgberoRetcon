"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ShieldCheck, ArrowRight, Check } from "lucide-react";

export default function AgberoAuth() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState<boolean>(true); // default to Sign In
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [agreeTerms, setAgreeTerms] = useState<boolean>(true);
  const [rememberMe, setRememberMe] = useState<boolean>(true);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    badgeId: "",
    email: "",
    phoneNumber: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-[#F6F5F2] flex items-center justify-center p-3 sm:p-6 lg:p-8 font-sans antialiased text-[#18181B]">
      {/* Outer Card */}
      <div className="w-full max-w-[1200px] bg-white rounded-2xl shadow-xl border border-[#E3E6E2] overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[680px]">
        {/* LEFT COLUMN: AUTH FORM */}
        <div className="lg:col-span-6 p-6 sm:p-10 lg:p-12 flex flex-col justify-between">
          <div>
            {/* Top Brand Logo */}
            <div className="flex items-center gap-2.5 mb-8">
              <div className="w-8 h-8 rounded-md bg-[#1B4D2E] flex items-center justify-center text-white shadow-xs">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold tracking-tight text-[#1B4D2E]">
                AgberoRecon
              </span>
            </div>

            {/* Headline & Description */}
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#163824] leading-snug">
                {isLogin ? "Sign In to AgberoRecon" : "Create Officer Account"}
              </h1>
              <p className="text-xs sm:text-sm text-[#5B635E] mt-1.5 leading-relaxed">
                {isLogin
                  ? "Access the live transport settlement ledger and vehicle verification portal."
                  : "Register administrative credentials to inspect park terminal settlements."}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {!isLogin ? (
                <>
                  {/* First Name & Last Name */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-[#EBF0EC] rounded-lg px-4 py-2.5 border border-transparent focus-within:border-[#1B4D2E] focus-within:bg-[#E4EBE5] transition-all">
                      <label
                        htmlFor="firstName"
                        className="block text-[11px] font-medium text-[#6B756F] mb-0.5"
                      >
                        First Name
                      </label>
                      <input
                        id="firstName"
                        name="firstName"
                        type="text"
                        required
                        value={formData.firstName}
                        onChange={handleChange}
                        placeholder="e.g. Tajudeen"
                        className="w-full bg-transparent text-sm font-medium text-[#18181B] focus:outline-hidden placeholder-[#9AA39C]"
                      />
                    </div>

                    <div className="bg-[#EBF0EC] rounded-lg px-4 py-2.5 border border-transparent focus-within:border-[#1B4D2E] focus-within:bg-[#E4EBE5] transition-all">
                      <label
                        htmlFor="lastName"
                        className="block text-[11px] font-medium text-[#6B756F] mb-0.5"
                      >
                        Last Name
                      </label>
                      <input
                        id="lastName"
                        name="lastName"
                        type="text"
                        required
                        value={formData.lastName}
                        onChange={handleChange}
                        placeholder="e.g. Balogun"
                        className="w-full bg-transparent text-sm font-medium text-[#18181B] focus:outline-hidden placeholder-[#9AA39C]"
                      />
                    </div>
                  </div>

                  {/* Badge ID */}
                  <div className="bg-[#EBF0EC] rounded-lg px-4 py-2.5 border border-transparent focus-within:border-[#1B4D2E] focus-within:bg-[#E4EBE5] transition-all">
                    <label
                      htmlFor="badgeId"
                      className="block text-[11px] font-medium text-[#6B756F] mb-0.5"
                    >
                      Union / LGA Badge ID
                    </label>
                    <input
                      id="badgeId"
                      name="badgeId"
                      type="text"
                      required
                      value={formData.badgeId}
                      onChange={handleChange}
                      placeholder="e.g. NURTW-LAG-042"
                      className="w-full bg-transparent text-sm font-medium text-[#18181B] focus:outline-hidden placeholder-[#9AA39C]"
                    />
                  </div>

                  {/* Email Address */}
                  <div className="bg-[#EBF0EC] rounded-lg px-4 py-2.5 border border-transparent focus-within:border-[#1B4D2E] focus-within:bg-[#E4EBE5] transition-all">
                    <label
                      htmlFor="email"
                      className="block text-[11px] font-medium text-[#6B756F] mb-0.5"
                    >
                      Official Email Address
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="e.g. officer@nurtw-lagos.org"
                      className="w-full bg-transparent text-sm font-medium text-[#18181B] focus:outline-hidden placeholder-[#9AA39C]"
                    />
                  </div>

                  {/* Password with Eye Toggle */}
                  <div className="bg-[#EBF0EC] rounded-lg px-4 py-2.5 border border-transparent focus-within:border-[#1B4D2E] focus-within:bg-[#E4EBE5] transition-all relative">
                    <label
                      htmlFor="password"
                      className="block text-[11px] font-medium text-[#6B756F] mb-0.5"
                    >
                      Password
                    </label>
                    <div className="flex items-center justify-between">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="Minimum 8 characters"
                        className="w-full bg-transparent text-sm font-medium text-[#18181B] focus:outline-hidden pr-8 placeholder-[#9AA39C]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-[#6B756F] hover:text-[#18181B] p-0.5 cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Terms & Privacy Checkbox */}
                  <div className="flex items-center gap-2 pt-1 pb-1">
                    <button
                      type="button"
                      onClick={() => setAgreeTerms(!agreeTerms)}
                      className={`w-4 h-4 rounded-xs flex items-center justify-center transition-colors cursor-pointer ${
                        agreeTerms ? "bg-[#1B4D2E] text-white" : "border border-[#8F9992] bg-white"
                      }`}
                    >
                      {agreeTerms && <Check className="h-3 w-3 stroke-[3]" />}
                    </button>
                    <label
                      onClick={() => setAgreeTerms(!agreeTerms)}
                      className="text-xs text-[#404843] cursor-pointer select-none"
                    >
                      I agree to the Terms &amp; Conditions
                    </label>
                  </div>
                </>
              ) : (
                /* LOGIN FORM FIELDS */
                <>
                  <div className="bg-[#EBF0EC] rounded-lg px-4 py-2.5 border border-transparent focus-within:border-[#1B4D2E] focus-within:bg-[#E4EBE5] transition-all">
                    <label
                      htmlFor="email"
                      className="block text-[11px] font-medium text-[#6B756F] mb-0.5"
                    >
                      Email Address or Badge ID
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="text"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="e.g. admin@agberorecon.ng"
                      className="w-full bg-transparent text-sm font-medium text-[#18181B] focus:outline-hidden placeholder-[#9AA39C]"
                    />
                  </div>

                  <div className="bg-[#EBF0EC] rounded-lg px-4 py-2.5 border border-transparent focus-within:border-[#1B4D2E] focus-within:bg-[#E4EBE5] transition-all relative">
                    <label
                      htmlFor="password"
                      className="block text-[11px] font-medium text-[#6B756F] mb-0.5"
                    >
                      Password
                    </label>
                    <div className="flex items-center justify-between">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        required
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="Enter password"
                        className="w-full bg-transparent text-sm font-medium text-[#18181B] focus:outline-hidden pr-8 placeholder-[#9AA39C]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-[#6B756F] hover:text-[#18181B] p-0.5 cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 pb-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setRememberMe(!rememberMe)}
                        className={`w-4 h-4 rounded-xs flex items-center justify-center transition-colors cursor-pointer ${
                          rememberMe ? "bg-[#1B4D2E] text-white" : "border border-[#8F9992] bg-white"
                        }`}
                      >
                        {rememberMe && <Check className="h-3 w-3 stroke-[3]" />}
                      </button>
                      <label
                        onClick={() => setRememberMe(!rememberMe)}
                        className="text-xs text-[#404843] cursor-pointer select-none"
                      >
                        Remember me
                      </label>
                    </div>

                    <span className="text-xs text-[#7A827D]">
                      Authorized Personnel Only
                    </span>
                  </div>
                </>
              )}

              {/* Action Button: Solid Green */}
              <button
                type="submit"
                className="w-full py-3 rounded-md bg-[#1E4D2B] hover:bg-[#163D22] text-white text-sm font-semibold tracking-tight shadow-xs transition-colors cursor-pointer active:scale-99 mt-2"
              >
                {isLogin ? "Sign In to Dashboard" : "Register Account"}
              </button>
            </form>

            {/* Switcher Link */}
            <div className="mt-5 text-xs text-[#5B635E]">
              {isLogin ? (
                <span>
                  New administrator?{" "}
                  <button
                    type="button"
                    onClick={() => setIsLogin(false)}
                    className="font-semibold text-[#18181B] hover:text-[#1B4D2E] underline cursor-pointer"
                  >
                    Create Account
                  </button>
                </span>
              ) : (
                <span>
                  Already registered?{" "}
                  <button
                    type="button"
                    onClick={() => setIsLogin(true)}
                    className="font-semibold text-[#18181B] hover:text-[#1B4D2E] underline cursor-pointer"
                  >
                    Sign In
                  </button>
                </span>
              )}
            </div>
          </div>

          {/* Quick Direct Link to Live Dashboard */}
          <div className="mt-8 pt-4 border-t border-[#EAEFEA] flex justify-between items-center text-xs text-[#6F7771]">
            <span>Transport Levy Settlement Network</span>
            <Link
              href="/dashboard"
              className="text-[#1B4D2E] hover:text-[#13371F] font-semibold flex items-center gap-1 hover:underline"
            >
              <span>Live Dashboard</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* RIGHT COLUMN: HERO LAGOS YELLOW BUS & TRICYCLE PHOTO */}
        <div className="lg:col-span-6 relative bg-[#18281F] overflow-hidden flex flex-col justify-end p-8 sm:p-12 min-h-[380px] lg:min-h-full">
          {/* Background Photo */}
          <Image
            src="/images/lagos_yellow_bus.jpg"
            alt="Lagos Yellow Danfo Bus and Keke Tricycle"
            fill
            priority
            className="object-cover object-center"
          />

          {/* Film Duotone Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A1610]/85 via-[#0D1F16]/30 to-[#142A1E]/15" />

          {/* Editorial Caption */}
          <div className="relative z-10 text-white max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/25 text-[11px] font-medium text-white mb-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>Lagos State Transit Settlement</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-snug drop-shadow-sm">
              Digital Settlement for the Informal Transit Economy
            </h3>
            <p className="text-xs text-white/80 mt-1 leading-relaxed font-normal drop-shadow-xs">
              Danfo commercial buses, tricycles, and park terminal unions reconciled into one transparent, offline-capable USSD ledger.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
