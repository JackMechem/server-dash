"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LuSettings2 } from "react-icons/lu";
import ControlPanel from "./serverMenu";

interface HeroProps {
	lastUpdated: string | null;
}

export default function Hero({ lastUpdated }: HeroProps) {
	const router = useRouter();
	const [authed, setAuthed] = useState<boolean>(false);
	const [menuOpen, setMenuOpen] = useState<boolean>(false);

	useEffect(() => {
		async function checkAuth() {
			try {
				const res = await fetch("/api/auth/check");
				setAuthed(res.ok);
			} finally {
			}
		}
		checkAuth();
	}, [router]);

	return (
		<div className="mb-11 animate-fade-up">
			{menuOpen &&
				typeof window !== "undefined" &&
				createPortal(
					<ControlPanel onClose={() => setMenuOpen(false)} />,
					document.body,
				)}
			<p className="text-xs font-medium tracking-widest uppercase text-blue-500 mb-3">
				dell-xps-nixos-serv
			</p>
			<div className="flex gap-[10px] items-center w-full">
				<svg
					className="w-[50px] h-[50px]"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 128 128"
				>
					<path
						fill="#7EBAE4"
						d="M50.732 43.771L20.525 96.428l-7.052-12.033 8.14-14.103-16.167-.042L2 64.237l3.519-6.15 23.013.073 8.27-14.352 13.93-.037zm2.318 42.094l60.409.003-6.827 12.164-16.205-.045 8.047 14.115-3.45 6.01-7.05.008-11.445-20.097-16.483-.034-6.996-12.124zm35.16-23.074l-30.202-52.66L71.888 10l8.063 14.148 8.12-14.072 6.897.002 3.532 6.143-11.57 20.024 8.213 14.386-6.933 12.16z"
						clipRule="evenodd"
						fillRule="evenodd"
					/>
					<path
						fill="#5277C3"
						d="M39.831 65.463l30.202 52.66-13.88.131-8.063-14.148-8.12 14.072-6.897-.002-3.532-6.143 11.57-20.024-8.213-14.386 6.933-12.16zm35.08-23.207l-60.409-.003L21.33 30.09l16.204.045-8.047-14.115 3.45-6.01 7.051-.01 11.444 20.097 16.484.034 6.996 12.124zm2.357 42.216l30.207-52.658 7.052 12.034-8.141 14.102 16.168.043L126 64.006l-3.519 6.15-23.013-.073-8.27 14.352-13.93.037z"
						clipRule="evenodd"
						fillRule="evenodd"
					/>
				</svg>
				<h1
					className="text-4xl md:text-5xl font-normal leading-tight tracking-tight text-gray-900 mb-2"
					style={{ fontFamily: "'Playfair Display', serif" }}
				>
					Home server
				</h1>
				{authed ? (
					<div
						onClick={() => setMenuOpen(true)}
						className="align-self-end ml-auto px-[20px] py-[20px] rounded-2xl hover:bg-gray-200 cursor-pointer duration-[200ms] text-gray-600 hover:shadow-sm font-[600]"
					>
						<LuSettings2 />
					</div>
				) : (
					<div
						onClick={() => router.push("/auth")}
						className="align-self-end ml-auto px-[18px] py-[5px] rounded-xl hover:bg-blue-500 shadow-sm bg-white border-blue-300 hover:border-blue-400 border cursor-pointer duration-[200ms] text-blue-400 hover:shadow-sm hover:text-blue-100 text-[11pt] font-[600]"
					>
						Authenticate
					</div>
				)}
			</div>
			<p className="text-sm text-gray-400 font-light">
				{lastUpdated
					? `Last updated ${new Date(lastUpdated).toLocaleTimeString()}`
					: "Fetching system stats..."}
			</p>
		</div>
	);
}
