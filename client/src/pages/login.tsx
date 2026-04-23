import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@/hooks/useAuth";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [, navigate] = useLocation();
  const login = useLogin();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate({ username, password }, { onSuccess: () => navigate("/suppliers/contacts") });
  }

  return (
    <div className="min-h-screen bg-youco-blue flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / wordmark */}
        <div className="text-center mb-8">
          <h1 className="font-heading text-3xl text-white tracking-wide">
            You &amp; Co.
          </h1>
          <p className="text-youco-bronze text-sm mt-1 tracking-widest uppercase">
            Corporate
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-lg shadow-xl p-8">
          <h2 className="font-heading text-xl text-youco-blue mb-6">
            Sign In
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue focus:border-transparent"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-youco-blue focus:border-transparent"
              />
            </div>

            {login.isError && (
              <p className="text-sm text-red-600">{login.error.message}</p>
            )}

            <button
              type="submit"
              disabled={login.isPending}
              className="w-full bg-youco-bronze hover:bg-amber-700 text-white font-medium py-2 px-4 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {login.isPending ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
