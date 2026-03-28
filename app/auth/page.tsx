"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthPage() {
	const router = useRouter();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [checking, setChecking] = useState(true);

	useEffect(() => {
		async function checkAuth() {
			try {
				const res = await fetch("/api/auth/check");
				if (res.ok) {
					const callbackUrl =
						new URLSearchParams(window.location.search).get("callbackUrl") ??
						"/";
					router.push(callbackUrl);
				}
			} finally {
				setChecking(false);
			}
		}
		checkAuth();
	}, [router]);

	async function handleLogin(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError("");

		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, password }),
			});

			if (!res.ok) {
				setError("Invalid username or password.");
				setLoading(false);
				return;
			}

			const callbackUrl =
				new URLSearchParams(window.location.search).get("callbackUrl") ?? "/";
			router.push(callbackUrl);
		} catch {
			setError("Something went wrong. Try again.");
			setLoading(false);
		}
	}

	if (checking) return null;

	return (
		<main className="h-full bg-gray-100 flex items-center justify-center">
			<div className="bg-white border border-gray-300 rounded-2xl md:p-12 p-8 w-full m-[10px] md:max-w-md shadow-sm">
				{/* Header */}
				<div className="mb-8">
					<p className="text-[11px] tracking-widest text-blue-500 uppercase mb-2">
						dell-xps-nixos-serv
					</p>
					<h1 className="text-[28px] font-normal text-gray-900 tracking-tight mb-1.5">
						Login
					</h1>
					<p className="text-sm text-gray-400">Enter system credentials</p>
				</div>

				<form onSubmit={handleLogin}>
					{/* Username */}
					<div className="mb-4">
						<label className="block text-[11px] tracking-wider text-gray-400 uppercase mb-1.5">
							Username
						</label>
						<input
							type="text"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							required
							autoComplete="username"
							className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 bg-gray-50 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 transition-colors"
						/>
					</div>

					{/* Password */}
					<div className="mb-6">
						<label className="block text-[11px] tracking-wider text-gray-400 uppercase mb-1.5">
							Password
						</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							autoComplete="current-password"
							className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 bg-gray-50 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 transition-colors"
						/>
					</div>

					{/* Error */}
					{error && <p className="text-[13px] text-red-400 mb-4">{error}</p>}

					{/* Submit */}
					<button
						type="submit"
						disabled={loading}
						className={`w-full py-2.5 rounded-xl text-md border border-blue-600 shadow-sm text-white font-[600] tracking-wide transition-colors ${
							loading
								? "bg-blue-200 cursor-not-allowed"
								: "bg-blue-500 hover:bg-blue-400 cursor-pointer"
						}`}
					>
						{loading ? "Signing in..." : "Sign in"}
					</button>
				</form>
			</div>
		</main>
	);
}
