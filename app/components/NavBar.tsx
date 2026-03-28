"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface NavBarProps {
	online: boolean;
}

export default function NavBar({ online }: NavBarProps) {
	const router = useRouter();
	const [auth, setAuth] = useState(false);

	useEffect(() => {
		fetch("/api/auth/check")
			.then((r) => setAuth(r.ok))
			.catch(() => setAuth(false));
	}, []);

	async function handleLogout() {
		await fetch("/api/auth/logout", { method: "POST" });
		router.push("/auth");
	}

	return (
		<nav className="flex items-center justify-between pt-7 pb-6 mb-13 border-b border-gray-200">
			<div className="flex items-center gap-2">
				{auth && (
					<button
						onClick={handleLogout}
						className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full cursor-pointer"
					>
						Log out
					</button>
				)}
			</div>

			<div
				className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border ${
					online
						? "text-green-700 bg-green-50 border-green-200"
						: "text-gray-500 bg-gray-50 border-gray-200"
				}`}
			>
				<span
					className="w-1.5 h-1.5 rounded-full"
					style={{
						background: online ? "#22c55e" : "#d1d5db",
						animation: online ? "pulse-dot 2s infinite" : "none",
					}}
				/>
				{online ? "Online" : "Connecting..."}
			</div>
		</nav>
	);
}
