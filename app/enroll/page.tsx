"use client";
import { useState } from "react";

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

type Status = "idle" | "starting" | "waiting_yubikey" | "saving" | "done" | "error";

export default function EnrollPage() {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [status, setStatus] = useState<Status>("idle");
	const [message, setMessage] = useState("");

	async function enroll(e: React.FormEvent) {
		e.preventDefault();
		setStatus("starting");
		setMessage("");

		try {
			// Step 1: get registration challenge
			const startRes = await fetch("/api/auth/register/start", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, password }),
			});

			if (!startRes.ok) {
				setMessage("Invalid credentials.");
				setStatus("error");
				return;
			}

			const { session_id, challenge } = await startRes.json();

			// Step 2: create credential with YubiKey
			setStatus("waiting_yubikey");
			const opts = challenge.publicKey;
			opts.challenge = b64uToBuf(opts.challenge);
			opts.user.id = b64uToBuf(opts.user.id);
			if (opts.excludeCredentials) {
				opts.excludeCredentials = opts.excludeCredentials.map(
					(c: { id: string; type: string; transports?: string[] }) => ({
						...c,
						id: b64uToBuf(c.id),
					}),
				);
			}

			let cred: PublicKeyCredential;
			try {
				cred = (await navigator.credentials.create({
					publicKey: opts,
				})) as PublicKeyCredential;
			} catch (err: unknown) {
				setMessage(
					"YubiKey error: " +
						(err instanceof Error ? err.message : "cancelled"),
				);
				setStatus("error");
				return;
			}

			// Step 3: save credential
			setStatus("saving");
			const attestation = cred.response as AuthenticatorAttestationResponse;

			const finishRes = await fetch("/api/auth/register/finish", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					session_id,
					credential: {
						id: cred.id,
						rawId: bufToB64u(cred.rawId),
						type: cred.type,
						response: {
							attestationObject: bufToB64u(attestation.attestationObject),
							clientDataJSON: bufToB64u(attestation.clientDataJSON),
							transports: attestation.getTransports
								? attestation.getTransports()
								: [],
						},
						extensions: {},
					},
				}),
			});

			if (!finishRes.ok) {
				setMessage("Registration failed. Check server logs.");
				setStatus("error");
				return;
			}

			setStatus("done");
			setMessage("YubiKey enrolled! You can now log in.");
		} catch {
			setMessage("Something went wrong. Try again.");
			setStatus("error");
		}
	}

	const canSubmit = status === "idle" || status === "error";
	const busy = !canSubmit;

	return (
		<main className="h-full bg-gray-100 flex items-center justify-center">
			<div className="bg-white border border-gray-300 rounded-2xl md:p-12 p-8 w-full m-[10px] md:max-w-md shadow-sm">
				{/* Header */}
				<div className="mb-8">
					<p className="text-[11px] tracking-widest text-blue-500 uppercase mb-2">
						dell-xps-nixos-serv
					</p>
					<h1 className="text-[28px] font-normal text-gray-900 tracking-tight mb-1.5">
						Enroll YubiKey
					</h1>
					<p className="text-sm text-gray-400">One-time security key setup</p>
				</div>

				{status === "done" ? (
					<p className="text-sm text-green-500">{message}</p>
				) : (
					<form onSubmit={enroll}>
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
								disabled={busy}
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
								disabled={busy}
								autoComplete="current-password"
								className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 bg-gray-50 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 transition-colors"
							/>
						</div>

						{/* YubiKey cue */}
						{status === "waiting_yubikey" && (
							<p className="text-sm text-blue-500 mb-4 text-center animate-pulse">
								Touch your YubiKey…
							</p>
						)}

						{/* Error */}
						{status === "error" && message && (
							<p className="text-[13px] text-red-400 mb-4">{message}</p>
						)}

						{/* Submit */}
						<button
							type="submit"
							disabled={busy}
							className={`w-full py-2.5 rounded-xl text-md border border-blue-600 shadow-sm text-white font-[600] tracking-wide transition-colors ${
								busy
									? "bg-blue-200 cursor-not-allowed"
									: "bg-blue-500 hover:bg-blue-400 cursor-pointer"
							}`}
						>
							{status === "idle" && "Register YubiKey"}
							{status === "error" && "Try again"}
							{status === "starting" && "Starting…"}
							{status === "waiting_yubikey" && "Touch YubiKey…"}
							{status === "saving" && "Saving…"}
						</button>
					</form>
				)}
			</div>
		</main>
	);
}
