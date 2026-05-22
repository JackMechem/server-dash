"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import HelpTooltip from "../components/HelpTooltip";

function b64uToBuf(b64u: string): ArrayBuffer {
	const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/");
	const bin = atob(b64);
	const buf = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
	return buf.buffer;
}

function bufToB64u(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

type Status = "idle" | "checking" | "waiting_yubikey" | "verifying";

export default function AuthPage() {
	const router = useRouter();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [status, setStatus] = useState<Status>("idle");
	const [initialChecking, setInitialChecking] = useState(true);

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
				setInitialChecking(false);
			}
		}
		checkAuth();
	}, [router]);

	async function handleLogin(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		setStatus("checking");

		try {
			const loginRes = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, password }),
			});

			if (!loginRes.ok) {
				setError("Invalid credentials.");
				setStatus("idle");
				return;
			}

			const { session_id, challenge } = await loginRes.json();

			setStatus("waiting_yubikey");
			const opts = challenge.publicKey;
			opts.challenge = b64uToBuf(opts.challenge);
			opts.userVerification = "discouraged";
			if (opts.allowCredentials) {
				opts.allowCredentials = opts.allowCredentials.map(
					(c: { id: string; type: string; transports?: string[] }) => ({
						type: c.type,
						id: b64uToBuf(c.id),
						transports: ["usb", "nfc", "ble", "hybrid"],
					}),
				);
			}

			let cred: PublicKeyCredential;
			try {
				cred = (await navigator.credentials.get({
					publicKey: opts,
				})) as PublicKeyCredential;
			} catch (err: unknown) {
				setError(
					"YubiKey error: " +
						(err instanceof Error ? err.message : "cancelled"),
				);
				setStatus("idle");
				return;
			}

			setStatus("verifying");
			const assertion = cred.response as AuthenticatorAssertionResponse;

			const verifyRes = await fetch("/api/auth/verify", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					session_id,
					credential: {
						id: cred.id,
						rawId: bufToB64u(cred.rawId),
						type: cred.type,
						response: {
							authenticatorData: bufToB64u(assertion.authenticatorData),
							clientDataJSON: bufToB64u(assertion.clientDataJSON),
							signature: bufToB64u(assertion.signature),
							userHandle: assertion.userHandle
								? bufToB64u(assertion.userHandle)
								: null,
						},
						extensions: {},
					},
				}),
			});

			if (!verifyRes.ok) {
				setError("YubiKey verification failed.");
				setStatus("idle");
				return;
			}

			const callbackUrl =
				new URLSearchParams(window.location.search).get("callbackUrl") ?? "/";
			router.push(callbackUrl);
		} catch {
			setError("Something went wrong. Try again.");
			setStatus("idle");
		}
	}

	if (initialChecking) return null;

	const busy = status !== "idle";

	return (
		<main className="h-full bg-primary flex items-center justify-center">
			<div className="bg-primary border border-secondary rounded-2xl md:p-12 p-8 w-full m-[10px] md:max-w-md">
				<div className="mb-8">
					<p className="text-[11px] tracking-widest text-blue uppercase mb-2">
						dell-xps-nixos-serv
					</p>
					<h1 className="text-[28px] font-normal text-foreground tracking-tight mb-1.5" style={{ lineHeight: "normal" }}>
						Login
					</h1>
					<p className="text-sm text-foreground-sec" style={{ fontSize: "14px", lineHeight: "normal" }}>Enter system credentials</p>
				</div>

				<form onSubmit={handleLogin}>
					<div className="mb-4">
						<label className="block text-[11px] tracking-wider text-foreground-sec uppercase mb-1.5">
							Username
						</label>
						<input
							type="text"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							required
							disabled={busy}
							autoComplete="username"
							className="w-full px-3.5 py-2.5 border border-secondary rounded-xl text-sm text-foreground bg-secondary/50 outline-none focus:border-blue/50 transition-colors"
						/>
					</div>

					<div className="mb-6">
						<label className="block text-[11px] tracking-wider text-foreground-sec uppercase mb-1.5">
							Password
						</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							disabled={busy}
							autoComplete="current-password"
							className="w-full px-3.5 py-2.5 border border-secondary rounded-xl text-sm text-foreground bg-secondary/50 outline-none focus:border-blue/50 transition-colors"
						/>
					</div>

					{status === "waiting_yubikey" && (
						<p className="text-sm text-blue mb-4 text-center animate-pulse" style={{ fontSize: "14px" }}>
							Touch your YubiKey…
						</p>
					)}

					{error && (
						<p className="text-[13px] text-red-400 mb-4">{error}</p>
					)}

					<HelpTooltip text="Submit your username and password, then touch your YubiKey when prompted to complete sign-in." block>
						<button
							type="submit"
							disabled={busy}
							className={`w-full py-2.5 rounded-xl text-md border border-blue/30 text-white font-[600] tracking-wide transition-colors ${
								busy
									? "bg-blue/40 cursor-not-allowed"
									: "bg-blue hover:bg-blue/80 cursor-pointer"
							}`}
						>
						{status === "idle" && "Sign in"}
						{status === "checking" && "Checking…"}
						{status === "waiting_yubikey" && "Waiting for YubiKey…"}
						{status === "verifying" && "Verifying…"}
					</button>
					</HelpTooltip>
				</form>
			</div>
		</main>
	);
}
