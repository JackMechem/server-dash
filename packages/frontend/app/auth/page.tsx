"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import HelpTooltip from "../components/HelpTooltip";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

type Status =
	| "idle"
	| "checking"
	| "waiting_yubikey"
	| "verifying"
	| "waiting_totp"
	| "verifying_totp"
	| "bypass_checking";

interface PendingChallenge {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	challenge: any;
	session_id: string;
}

export default function AuthPage() {
	const router = useRouter();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [status, setStatus] = useState<Status>("idle");
	const [initialChecking, setInitialChecking] = useState(true);
	const [hasTotpFallback, setHasTotpFallback] = useState(false);
	const [totpCode, setTotpCode] = useState("");
	const [pendingChallenge, setPendingChallenge] = useState<PendingChallenge | null>(null);
	const webauthnAbort = useRef<AbortController | null>(null);

	useEffect(() => {
		async function checkAuth() {
			try {
				const res = await fetch("/api/auth/check");
				if (res.ok) {
					const callbackUrl =
						new URLSearchParams(window.location.search).get("callbackUrl") ?? "/";
					router.push(callbackUrl);
				}
			} finally {
				setInitialChecking(false);
			}
		}
		checkAuth();
	}, [router]);

	const redirect = () => {
		const callbackUrl =
			new URLSearchParams(window.location.search).get("callbackUrl") ?? "/";
		router.push(callbackUrl);
	};

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

			const data = await loginRes.json();

			if (data.no_2fa) {
				redirect();
				return;
			}

			const { session_id, challenge, has_totp } = data;
			setHasTotpFallback(!!has_totp);

			if (!challenge) {
				setPendingChallenge({ challenge: null, session_id });
				setStatus("waiting_totp");
				return;
			}

			// Store challenge and show waiting screen — user can pick a method before we fire WebAuthn
			setPendingChallenge({ challenge, session_id });
			setStatus("waiting_yubikey");
		} catch {
			setError("Something went wrong. Try again.");
			setStatus("idle");
		}
	}

	async function fireWebAuthn() {
		if (!pendingChallenge) return;
		const { challenge, session_id } = pendingChallenge;
		setError("");

		try {
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

			webauthnAbort.current = new AbortController();
			let cred: PublicKeyCredential;
			try {
				cred = (await navigator.credentials.get({
					publicKey: opts,
					signal: webauthnAbort.current.signal,
				})) as PublicKeyCredential;
			} catch (err: unknown) {
				if (err instanceof Error && err.name === "AbortError") return;
				setError(
					"Security key error: " +
						(err instanceof Error ? err.message : "cancelled"),
				);
				setStatus("waiting_yubikey");
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
				setError("Security key verification failed.");
				setStatus("waiting_yubikey");
				return;
			}

			redirect();
		} catch {
			setError("Something went wrong. Try again.");
			setStatus("waiting_yubikey");
		}
	}

	function switchToTotp() {
		webauthnAbort.current?.abort();
		setError("");
		setTotpCode("");
		setStatus("waiting_totp");
	}

	async function handleBypassLogin() {
		setError("");
		setStatus("bypass_checking");
		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, password, bypass_2fa: true }),
			});
			if (!res.ok) {
				setError("Invalid credentials.");
				setStatus("idle");
				return;
			}
			redirect();
		} catch {
			setError("Something went wrong.");
			setStatus("idle");
		}
	}

	async function handleTotpVerify(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		setStatus("verifying_totp");

		try {
			const res = await fetch("/api/auth/verify-totp", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					session_id: pendingChallenge?.session_id ?? "",
					code: totpCode,
				}),
			});

			if (!res.ok) {
				setError("Invalid code. Please try again.");
				setStatus("waiting_totp");
				return;
			}

			redirect();
		} catch {
			setError("Something went wrong. Try again.");
			setStatus("waiting_totp");
		}
	}

	if (initialChecking) return null;

	const busy = status !== "idle";
	const inTotpMode = status === "waiting_totp" || status === "verifying_totp";
	const totpBusy = status === "verifying_totp";
	const inYubikeyMode = status === "waiting_yubikey" || status === "verifying" || status === "bypass_checking";

	return (
		<main className="h-full bg-background flex items-center justify-center">
			<div className="bg-background border border-border rounded-2xl md:p-12 p-8 w-full m-[10px] md:max-w-md">
				<div className="mb-8">
					<h1
						className="text-[28px] font-normal text-foreground tracking-tight mb-1.5"
						style={{ lineHeight: "normal" }}
					>
						Login
					</h1>
					<p className="text-sm text-muted-foreground" style={{ lineHeight: "normal" }}>
						Enter your credentials
					</p>
				</div>

				{inYubikeyMode ? (
					<div className="flex flex-col gap-4">
						<p className="text-sm text-muted-foreground text-center">
							Your password was accepted. Verify with your security key to continue.
						</p>

						{error && (
							<Alert variant="destructive">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}

						<Button
							onClick={fireWebAuthn}
							disabled={status === "verifying"}
							className="w-full py-2.5 h-auto"
						>
							{status === "verifying" ? "Verifying…" : "Touch Security Key"}
						</Button>

						<div className="flex flex-col items-center gap-1">
							{hasTotpFallback && (
								<Button type="button" variant="link" size="sm" onClick={switchToTotp}>
									Use authenticator app instead
								</Button>
							)}
							<Button
								type="button"
								variant="link"
								size="sm"
								className="text-muted-foreground text-xs"
								onClick={handleBypassLogin}
								disabled={status === "bypass_checking"}
							>
								{status === "bypass_checking" ? "Signing in…" : "Skip 2FA (password only)"}
							</Button>
						</div>
					</div>
				) : !inTotpMode ? (
					<form onSubmit={handleLogin}>
						<div className="mb-4">
							<Label className="block mb-1.5">Username</Label>
							<Input
								type="text"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								required
								disabled={busy}
								autoComplete="username"
								className="py-2.5"
							/>
						</div>

						<div className="mb-6">
							<Label className="block mb-1.5">Password</Label>
							<Input
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								required
								disabled={busy}
								autoComplete="current-password"
								className="py-2.5"
							/>
						</div>

						{error && (
							<Alert variant="destructive" className="mb-4">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}

						<HelpTooltip
							text="Submit your username and password, then touch your security key when prompted."
							block
						>
							<Button
								type="submit"
								disabled={busy}
								className="w-full py-2.5 h-auto"
							>
								{status === "checking" ? "Checking…" : "Sign in"}
							</Button>
						</HelpTooltip>
					</form>
				) : (
					<form onSubmit={handleTotpVerify}>
						<div className="mb-6">
							<Label className="block mb-1.5">Authenticator Code</Label>
							<Input
								type="text"
								inputMode="numeric"
								pattern="[0-9]{6}"
								maxLength={6}
								value={totpCode}
								onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
								required
								disabled={totpBusy}
								autoComplete="one-time-code"
								placeholder="000000"
								className="py-2.5 tracking-widest text-center text-lg font-mono"
							/>
							<p className="text-[11px] text-muted-foreground mt-1.5">
								Enter the 6-digit code from your authenticator app.
							</p>
						</div>

						{error && (
							<Alert variant="destructive" className="mb-4">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}

						<Button
							type="submit"
							disabled={totpBusy || totpCode.length !== 6}
							className="w-full py-2.5 h-auto mb-3"
						>
							{totpBusy ? "Verifying…" : "Verify Code"}
						</Button>

						<Button
							type="button"
							variant="link"
							className="w-full"
							onClick={() => {
								setStatus("idle");
								setError("");
								setTotpCode("");
							}}
						>
							Back to login
						</Button>
					</form>
				)}
			</div>
		</main>
	);
}
