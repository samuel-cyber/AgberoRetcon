"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck, Mail, Lock, User, IdCard, ArrowRight } from "lucide-react";

export default function AgberoAuth() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [formData, setFormData] = useState({
    fullName: "",
    badgeId: "",
    email: "",
    password: "",
    rememberMe: false,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // Handle smooth transition between forms
  const toggleForm = (loginState: boolean) => {
    if (isLogin === loginState) return;
    setIsAnimating(true);
    setTimeout(() => {
      setIsLogin(loginState);
      setIsAnimating(false);
    }, 150); // Short delay to allow fade out
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log(
      isLogin
        ? { action: "Signing in...", email: formData.email }
        : { action: "Signing up...", ...formData }
    );
    // Navigate to dashboard
    router.push("/dashboard");
  };

  const styleSheet = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(5px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .fade-in {
      animation: fadeIn 0.3s ease-out forwards;
    }
    .fade-out {
      opacity: 0;
      transform: translateY(-5px);
      transition: all 0.15s ease-out;
    }
  `;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans selection:bg-green-200">
      <style>{styleSheet}</style>

      {/* Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center mb-8">
        <div className="bg-green-700 p-3 rounded-xl shadow-sm mb-4">
          <ShieldCheck className="h-10 w-10 text-white" />
        </div>
        <h2 className="text-center text-3xl font-extrabold text-slate-900 tracking-tight">
          AgberoRecon
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Transport Levy Settlement & Verification
        </p>
      </div>

      {/* Card */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-2xl sm:px-10 border border-slate-100">
          
          {/* Toggle Switch */}
          <div className="flex p-1 mb-8 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => toggleForm(true)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                isLogin 
                  ? "bg-white text-green-700 shadow-sm border border-slate-200/50" 
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => toggleForm(false)}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                !isLogin 
                  ? "bg-white text-green-700 shadow-sm border border-slate-200/50" 
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Form with fade transition */}
          <div className={isAnimating ? "fade-out" : "fade-in"}>
            <form className="space-y-5" onSubmit={handleSubmit}>
              
              {/* Sign Up Exclusive Fields */}
              {!isLogin && (
                <>
                  <div>
                    <label htmlFor="fullName" className="block text-sm font-medium text-slate-700">
                      Full Name
                    </label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        id="fullName"
                        name="fullName"
                        type="text"
                        value={formData.fullName}
                        onChange={handleChange}
                        required={!isLogin}
                        className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 sm:text-sm bg-slate-50 placeholder:text-slate-400 transition-colors"
                        placeholder="e.g. Tajudeen Balogun"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Official name as recognized by union branch</p>
                  </div>

                  <div>
                    <label htmlFor="badgeId" className="block text-sm font-medium text-slate-700">
                      Union/LGA Badge ID
                    </label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <IdCard className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        id="badgeId"
                        name="badgeId"
                        type="text"
                        value={formData.badgeId}
                        onChange={handleChange}
                        required={!isLogin}
                        className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 sm:text-sm bg-slate-50 placeholder:text-slate-400 transition-colors"
                        placeholder="e.g. NURTW-LAG-001 or RTEAN-042"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Accreditation badge (NURTW, RTEAN, or LGA official ID)</p>
                  </div>
                </>
              )}

              {/* Shared Fields (Email & Password) */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  Email Address
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 sm:text-sm bg-slate-50 placeholder:text-slate-400 transition-colors"
                    placeholder={isLogin ? "e.g. admin@agberorecon.ng" : "e.g. officer@nurtw-lagos.org"}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <div className="mt-1 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    value={formData.password}
                    onChange={handleChange}
                    required
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 sm:text-sm bg-slate-50 placeholder:text-slate-400 transition-colors"
                    placeholder={isLogin ? "Enter your password" : "Create password (min. 8 characters)"}
                  />
                </div>
              </div>

              {/* Remember me & Forgot Password */}
              {isLogin && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      id="remember-me"
                      name="rememberMe"
                      type="checkbox"
                      checked={formData.rememberMe}
                      onChange={handleChange}
                      className="h-4 w-4 text-green-600 focus:ring-green-500 border-slate-300 rounded"
                    />
                    <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-700">
                      Remember me
                    </label>
                  </div>
                  <div className="text-sm">
                    <a href="#" className="font-medium text-green-700 hover:text-green-600 transition-colors">
                      Forgot password?
                    </a>
                  </div>
                </div>
              )}

              <div>
                <Link
                  href="/dashboard"
                  className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-green-700 hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-600 transition-all active:scale-[0.98] cursor-pointer"
                >
                  {isLogin ? "Sign In to Dashboard" : "Create Admin Account"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {/* Direct Testing Shortcut */}
              <div className="text-center pt-1">
                <Link
                  href="/dashboard"
                  className="text-xs text-green-700 hover:text-green-800 font-medium inline-flex items-center gap-1 hover:underline"
                >
                  ⚡ Direct Test Access: Go to Live Dashboard &rarr;
                </Link>
              </div>
            </form>
          </div>
          
          {/* Footer note */}
          <div className="mt-6 text-center text-xs text-slate-500 border-t border-slate-100 pt-6">
            Secured for Civic Tech & Public Good
          </div>
        </div>
      </div>
    </div>
  );
}
