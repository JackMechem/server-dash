"use client";

import { useState, useEffect, useCallback } from "react";
import QRCode from "qrcode";
import SideNav from "../components/SideNav";
import {
	IconUser,
	IconLock,
	IconCheck,
	IconRefresh,
	IconKey,
	IconTrash,
	IconShieldCheck,
	IconShieldOff,
	IconPlus,
	IconX,
} from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/ui/section-label";
import { Spinner } from "@/components/ui/spinner";

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

interface Credential {
	id: string;
	label?: string;
}

interface AccountInfo {
	username: string;
	system_user: string | null;
	permission_level: string;
	has_app_credential: boolean;
	credentials: Credential[];
	has_totp: boolean;
}

type ActiveSection = "username" | "password" | null;
type EnrollTab = "security-key" | "passkey";
type EnrollStatus = "idle" | "starting" | "waiting_key" | "saving" | "done" | "error";
type TotpStep = "idle" | "setup" | "fetching" | "ready" | "confirming" | "done";

function StatusMessage({ message, isError }: { message: string; isError: boolean }) {
	if (!message) return null;
	return (
		<Alert variant={isError ? "destructive" : "success"}>
			<AlertDescription>{message}</AlertDescription>
		</Alert>
	);
}

const truncId = (id: string) =>
	id.length > 20 ? id.slice(0, 10) + "…" + id.slice(-6) : id;

export default function AccountPage() {
	const [info, setInfo] = useState<AccountInfo | null>(null);
	const [loading, setLoading] = useState(true);
	const [activeSection, setActiveSection] = useState<ActiveSection>(null);

	// Change username
	const [newUsername, setNewUsername] = useState("");
	const [usernamePassword, setUsernamePassword] = useState("");
	const [usernameMsg, setUsernameMsg] = useState("");
	const [usernameErr, setUsernameErr] = useState(false);
	const [usernameBusy, setUsernameBusy] = useState(false);

	// Change password
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [passwordMsg, setPasswordMsg] = useState("");
	const [passwordErr, setPasswordErr] = useState(false);
	const [passwordBusy, setPasswordBusy] = useState(false);

	// WebAuthn enrollment
	const [enrollTab, setEnrollTab] = useState<EnrollTab>("security-key");
	const [enrollPassword, setEnrollPassword] = useState("");
	const [enrollLabel, setEnrollLabel] = useState("");
	const [enrollStatus, setEnrollStatus] = useState<EnrollStatus>("idle");
	const [enrollMessage, setEnrollMessage] = useState("");
	const [deletingCredId, setDeletingCredId] = useState<string | null>(null);

	// TOTP
	const [totpStep, setTotpStep] = useState<TotpStep>("idle");
	const [totpPassword, setTotpPassword] = useState("");
	const [totpSecret, setTotpSecret] = useState("");
	const [totpQrDataUrl, setTotpQrDataUrl] = useState("");
	const [totpCode, setTotpCode] = useState("");
	const [totpMessage, setTotpMessage] = useState("");
	const [removingTotp, setRemovingTotp] = useState(false);

	const fetchInfo = useCallback(async () => {
		setLoading(true);
		const res = await fetch("/api/account");
		if (res.ok) {
			const data = await res.json();
			setInfo(data);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		fetchInfo();
	}, [fetchInfo]);

	const handleUsernameChange = async (e: React.FormEvent) => {
		e.preventDefault();
		setUsernameBusy(true);
		setUsernameMsg("");
		const res = await fetch("/api/account", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ new_username: newUsername, current_password: usernamePassword }),
		});
		const data = await res.json().catch(() => ({}));
		setUsernameBusy(false);
		if (!res.ok) {
			setUsernameMsg(data.error ?? "Failed to update username.");
			setUsernameErr(true);
		} else {
			setUsernameMsg("Username updated. Log out and back in to use your new username.");
			setUsernameErr(false);
			setNewUsername("");
			setUsernamePassword("");
			await fetchInfo();
		}
	};

	const handlePasswordChange = async (e: React.FormEvent) => {
		e.preventDefault();
		if (newPassword !== confirmPassword) {
			setPasswordMsg("Passwords do not match.");
			setPasswordErr(true);
			return;
		}
		setPasswordBusy(true);
		setPasswordMsg("");
		const res = await fetch("/api/account", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
		});
		const data = await res.json().catch(() => ({}));
		setPasswordBusy(false);
		if (!res.ok) {
			setPasswordMsg(data.error ?? "Failed to update password.");
			setPasswordErr(true);
		} else {
			setPasswordMsg("Password updated successfully.");
			setPasswordErr(false);
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
		}
	};

	const deleteCredential = async (credId: string) => {
		if (!info) return;
		setDeletingCredId(credId);
		await fetch(`/api/users/${encodeURIComponent(info.username)}/credentials/${credId}`, {
			method: "DELETE",
		});
		setDeletingCredId(null);
		await fetchInfo();
	};

	const enrollKey = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!info) return;
		setEnrollStatus("starting");
		setEnrollMessage("");

		try {
			const startRes = await fetch(`/api/users/${encodeURIComponent(info.username)}/enroll/start`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password: enrollPassword }),
			});

			if (!startRes.ok) {
				setEnrollMessage("Invalid password.");
				setEnrollStatus("error");
				return;
			}

			const { session_id, challenge } = await startRes.json();
			setEnrollStatus("waiting_key");

			const opts = challenge.publicKey;
			opts.challenge = b64uToBuf(opts.challenge);
			opts.user.id = b64uToBuf(opts.user.id);

			if (enrollTab === "passkey") {
				opts.authenticatorSelection = {
					authenticatorAttachment: "cross-platform",
					residentKey: "preferred",
					requireResidentKey: false,
					userVerification: "preferred",
				};
			} else {
				opts.authenticatorSelection = {
					authenticatorAttachment: "cross-platform",
					residentKey: "discouraged",
					requireResidentKey: false,
					userVerification: "discouraged",
				};
				(opts as Record<string, unknown>).hints = ["security-key"];
			}

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
			} catch (err) {
				setEnrollMessage(
					(enrollTab === "passkey" ? "Passkey" : "YubiKey") +
						" error: " +
						(err instanceof Error ? err.message : "cancelled"),
				);
				setEnrollStatus("error");
				return;
			}

			setEnrollStatus("saving");
			const attestation = cred.response as AuthenticatorAttestationResponse;

			const finishRes = await fetch(
				`/api/users/${encodeURIComponent(info.username)}/enroll/finish`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						session_id,
						label: enrollLabel.trim() || null,
						credential: {
							id: cred.id,
							rawId: bufToB64u(cred.rawId),
							type: cred.type,
							response: {
								attestationObject: bufToB64u(attestation.attestationObject),
								clientDataJSON: bufToB64u(attestation.clientDataJSON),
								transports: ["usb", "nfc", "ble", "hybrid"],
							},
							extensions: {},
						},
					}),
				},
			);

			if (!finishRes.ok) {
				setEnrollMessage("Registration failed. Check server logs.");
				setEnrollStatus("error");
				return;
			}

			setEnrollStatus("done");
			setEnrollMessage(
				enrollTab === "passkey"
					? "Passkey enrolled successfully."
					: "YubiKey enrolled successfully.",
			);
			setEnrollPassword("");
			setEnrollLabel("");
			await fetchInfo();
		} catch {
			setEnrollMessage("Something went wrong. Try again.");
			setEnrollStatus("error");
		}
	};

	const startTotpSetup = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!info) return;
		setTotpStep("fetching");
		setTotpMessage("");

		const res = await fetch(`/api/users/${encodeURIComponent(info.username)}/totp/setup`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password: totpPassword }),
		});

		if (!res.ok) {
			setTotpMessage("Invalid password.");
			setTotpStep("setup");
			return;
		}

		const { secret, uri } = await res.json();
		setTotpSecret(secret);
		const dataUrl = await QRCode.toDataURL(uri, {
			width: 160,
			margin: 1,
			color: { dark: "#000", light: "#fff" },
		});
		setTotpQrDataUrl(dataUrl);
		setTotpStep("ready");
	};

	const confirmTotp = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!info) return;
		setTotpStep("confirming");
		setTotpMessage("");

		const res = await fetch(`/api/users/${encodeURIComponent(info.username)}/totp/confirm`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ secret: totpSecret, code: totpCode }),
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setTotpMessage(data.error ?? "Invalid code. Check your clock is synced.");
			setTotpStep("ready");
			return;
		}

		setTotpStep("done");
		setTotpMessage("Authenticator app configured.");
		await fetchInfo();
	};

	const removeTotp = async () => {
		if (!info) return;
		setRemovingTotp(true);
		await fetch(`/api/users/${encodeURIComponent(info.username)}/totp`, { method: "DELETE" });
		setRemovingTotp(false);
		setTotpStep("idle");
		await fetchInfo();
	};

	const enrollBusy =
		enrollStatus !== "idle" && enrollStatus !== "error" && enrollStatus !== "done";

	return (
		<div className="w-full h-full bg-background text-foreground overflow-hidden flex flex-row">
			<SideNav online={false} isAuthed={true} />

			<div className="flex-1 overflow-y-auto lg:m-[10px_10px_10px_0px] lg:rounded-2xl lg:border lg:border-primary/20">
				<div className="max-w-[560px] mx-auto px-5 py-8">
					{/* Header */}
					<div className="mb-7">
						<h1 className="text-[22px] font-bold text-foreground">Account</h1>
						<p className="text-sm text-muted-foreground mt-1">
							Manage your credentials and two-factor authentication.
						</p>
					</div>

					{loading ? (
						<div className="flex flex-col gap-3">
							{[...Array(4)].map((_, i) => (
								<Skeleton key={i} className="h-[60px] rounded-xl" />
							))}
						</div>
					) : info ? (
						<div className="flex flex-col gap-6">
							{/* Current info card */}
							{info.has_app_credential && (
								<div className="flex flex-col gap-3 p-4 rounded-2xl bg-muted/30 border border-border">
									<SectionLabel divider>Current Credentials</SectionLabel>
									<div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
										<span className="text-muted-foreground">App username</span>
										<span className="font-semibold text-foreground">{info.username}</span>
										<span className="text-muted-foreground">Permission level</span>
										<Badge className="w-fit">{info.permission_level}</Badge>
									</div>
								</div>
							)}

							{!info.has_app_credential && (
								<Alert>
									<AlertDescription>
										No app credentials are configured for your account. Contact an administrator.
									</AlertDescription>
								</Alert>
							)}

							{/* Change username */}
							{info.has_app_credential && (
								<div>
									<SectionLabel divider className="mb-3">
										Change Username
									</SectionLabel>
									{activeSection === "username" ? (
										<form onSubmit={handleUsernameChange} className="flex flex-col gap-3">
											<div>
												<Label className="block mb-1.5">New username</Label>
												<Input
													type="text"
													value={newUsername}
													onChange={(e) => setNewUsername(e.target.value)}
													required
													disabled={usernameBusy}
													maxLength={64}
													placeholder="New app username"
												/>
											</div>
											<div>
												<Label className="block mb-1.5">Current password</Label>
												<Input
													type="password"
													value={usernamePassword}
													onChange={(e) => setUsernamePassword(e.target.value)}
													required
													disabled={usernameBusy}
													autoComplete="current-password"
												/>
											</div>
											<StatusMessage message={usernameMsg} isError={usernameErr} />
											<div className="flex gap-2">
												<Button type="submit" disabled={usernameBusy} size="sm">
													{usernameBusy ? <Spinner size="xs" /> : <IconUser size={12} />}
													{usernameBusy ? "Saving…" : "Update Username"}
												</Button>
												<Button
													type="button"
													variant="outline"
													size="sm"
													disabled={usernameBusy}
													onClick={() => {
														setActiveSection(null);
														setUsernameMsg("");
													}}
												>
													Cancel
												</Button>
											</div>
										</form>
									) : (
										<div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-muted/30">
											<div className="flex items-center gap-2.5">
												<IconUser size={14} className="text-muted-foreground" />
												<span className="text-sm text-foreground">{info.username}</span>
											</div>
											<Button
												variant="link"
												size="sm"
												onClick={() => {
													setActiveSection("username");
													setUsernameMsg("");
												}}
											>
												Change
											</Button>
										</div>
									)}
									{activeSection !== "username" && usernameMsg && (
										<div className="mt-2">
											<StatusMessage message={usernameMsg} isError={usernameErr} />
										</div>
									)}
								</div>
							)}

							{/* Change password */}
							{info.has_app_credential && (
								<div>
									<SectionLabel divider className="mb-3">
										Change Password
									</SectionLabel>
									{activeSection === "password" ? (
										<form onSubmit={handlePasswordChange} className="flex flex-col gap-3">
											<div>
												<Label className="block mb-1.5">Current password</Label>
												<Input
													type="password"
													value={currentPassword}
													onChange={(e) => setCurrentPassword(e.target.value)}
													required
													disabled={passwordBusy}
													autoComplete="current-password"
												/>
											</div>
											<div>
												<Label className="block mb-1.5">New password</Label>
												<Input
													type="password"
													value={newPassword}
													onChange={(e) => setNewPassword(e.target.value)}
													required
													disabled={passwordBusy}
													autoComplete="new-password"
												/>
											</div>
											<div>
												<Label className="block mb-1.5">Confirm new password</Label>
												<Input
													type="password"
													value={confirmPassword}
													onChange={(e) => setConfirmPassword(e.target.value)}
													required
													disabled={passwordBusy}
													autoComplete="new-password"
												/>
											</div>
											<StatusMessage message={passwordMsg} isError={passwordErr} />
											<div className="flex gap-2">
												<Button type="submit" disabled={passwordBusy} size="sm">
													{passwordBusy ? <Spinner size="xs" /> : <IconLock size={12} />}
													{passwordBusy ? "Saving…" : "Update Password"}
												</Button>
												<Button
													type="button"
													variant="outline"
													size="sm"
													disabled={passwordBusy}
													onClick={() => {
														setActiveSection(null);
														setPasswordMsg("");
													}}
												>
													Cancel
												</Button>
											</div>
										</form>
									) : (
										<div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-muted/30">
											<div className="flex items-center gap-2.5">
												<IconLock size={14} className="text-muted-foreground" />
												<span className="text-sm text-muted-foreground">••••••••</span>
											</div>
											<Button
												variant="link"
												size="sm"
												onClick={() => {
													setActiveSection("password");
													setPasswordMsg("");
												}}
											>
												Change
											</Button>
										</div>
									)}
									{activeSection !== "password" && passwordMsg && (
										<div className="mt-2">
											<StatusMessage message={passwordMsg} isError={passwordErr} />
										</div>
									)}
								</div>
							)}

							{/* Security Keys & Passkeys */}
							<div>
								<SectionLabel divider className="mb-3">
									Security Keys &amp; Passkeys
									<span className="ml-auto text-[10px] text-muted-foreground font-normal normal-case tracking-normal">
										{info.credentials.length}
									</span>
								</SectionLabel>

								{/* Enrolled credentials list */}
								{info.credentials.length === 0 ? (
									<div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted/30 text-muted-foreground mb-3">
										<IconKey size={13} />
										<span className="text-xs">No keys or passkeys enrolled</span>
									</div>
								) : (
									<div className="flex flex-col gap-[5px] mb-3">
										{info.credentials.map((cred) => (
											<div
												key={cred.id}
												className="flex items-center gap-2.5 px-3 py-[11px] rounded-xl bg-muted/30 group"
											>
												<IconKey size={13} className="text-primary shrink-0" />
												<div className="flex flex-col gap-[1px] flex-1 min-w-0">
													<span
														className={`text-xs truncate ${cred.label ? "text-foreground font-medium" : "text-muted-foreground font-mono"}`}
													>
														{cred.label ?? truncId(cred.id)}
													</span>
													{cred.label && (
														<span className="text-[10px] text-muted-foreground font-mono truncate">
															{truncId(cred.id)}
														</span>
													)}
												</div>
												<button
													onClick={() => deleteCredential(cred.id)}
													disabled={deletingCredId === cred.id}
													className="p-2 lg:p-[5px] rounded-[7px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors lg:opacity-0 lg:group-hover:opacity-100 cursor-pointer disabled:opacity-50 shrink-0"
												>
													{deletingCredId === cred.id ? (
														<Spinner size="xs" />
													) : (
														<IconTrash size={13} />
													)}
												</button>
											</div>
										))}
									</div>
								)}

								{/* Enrollment tabs */}
								<div className="flex gap-1 mb-3 p-[3px] bg-muted/40 rounded-xl w-fit">
									{(["security-key", "passkey"] as EnrollTab[]).map((t) => (
										<button
											key={t}
											type="button"
											onClick={() => {
												setEnrollTab(t);
												setEnrollStatus("idle");
												setEnrollMessage("");
											}}
											className={`px-3.5 py-2 rounded-[9px] text-xs font-semibold transition-colors cursor-pointer ${
												enrollTab === t
													? "bg-primary text-primary-foreground"
													: "text-muted-foreground hover:text-foreground"
											}`}
										>
											{t === "security-key" ? "Enroll YubiKey" : "Enroll Passkey"}
										</button>
									))}
								</div>

								{enrollStatus === "done" ? (
									<Alert variant="success">
										<AlertDescription className="flex items-center justify-between">
											{enrollMessage}
											<button
												onClick={() => setEnrollStatus("idle")}
												className="text-green/60 hover:text-green cursor-pointer ml-2"
											>
												<IconX size={13} />
											</button>
										</AlertDescription>
									</Alert>
								) : (
									<form onSubmit={enrollKey} className="flex flex-col gap-2.5">
										<div>
											<Label className="block mb-1.5">Current password</Label>
											<Input
												type="password"
												value={enrollPassword}
												onChange={(e) => setEnrollPassword(e.target.value)}
												required
												disabled={enrollBusy}
												placeholder="Enter your password"
												autoComplete="current-password"
											/>
										</div>
										<div>
											<Label className="block mb-1.5">
												Name{" "}
												<span className="normal-case text-muted-foreground/60">(optional)</span>
											</Label>
											<Input
												type="text"
												value={enrollLabel}
												onChange={(e) => setEnrollLabel(e.target.value)}
												disabled={enrollBusy}
												placeholder={
													enrollTab === "passkey"
														? "e.g. Bitwarden passkey"
														: "e.g. YubiKey 5C"
												}
												maxLength={64}
											/>
										</div>

										{enrollStatus === "waiting_key" && (
											<p className="text-xs text-primary text-center animate-pulse">
												{enrollTab === "passkey"
													? "Complete passkey enrollment in your password manager…"
													: "Touch your YubiKey…"}
											</p>
										)}
										{enrollStatus === "error" && enrollMessage && (
											<Alert variant="destructive">
												<AlertDescription>{enrollMessage}</AlertDescription>
											</Alert>
										)}

										<Button
											type="submit"
											size="sm"
											disabled={enrollBusy}
											className="w-fit"
										>
											<IconPlus size={13} />
											{enrollBusy
												? enrollStatus === "starting"
													? "Starting…"
													: enrollStatus === "waiting_key"
														? enrollTab === "passkey"
															? "Waiting…"
															: "Touch key…"
														: "Saving…"
												: enrollTab === "passkey"
													? "Enroll Passkey"
													: "Enroll YubiKey"}
										</Button>
									</form>
								)}
							</div>

							{/* TOTP / Authenticator App */}
							<div>
								<SectionLabel divider className="mb-3">
									Authenticator App (TOTP)
								</SectionLabel>

								{info.has_totp ? (
									<>
										{totpStep === "idle" && (
											<div className="flex items-center gap-2.5 px-3 py-[9px] rounded-xl bg-muted/30">
												<IconShieldCheck size={13} className="text-green shrink-0" />
												<span className="text-xs text-foreground flex-1">
													Authenticator app configured
												</span>
												<Button
													variant="destructive"
													size="xs"
													onClick={removeTotp}
													disabled={removingTotp}
												>
													{removingTotp ? <Spinner size="xs" /> : <IconTrash size={11} />}
													Remove
												</Button>
											</div>
										)}
									</>
								) : totpStep === "idle" ? (
									<div className="flex items-center gap-2.5 px-3 py-[9px] rounded-xl bg-muted/30">
										<IconShieldOff size={13} className="text-muted-foreground shrink-0" />
										<span className="text-xs text-muted-foreground flex-1">Not configured</span>
										<Button
											size="xs"
											variant="outline"
											onClick={() => setTotpStep("setup")}
										>
											<IconPlus size={11} />
											Set up
										</Button>
									</div>
								) : null}

								{(totpStep === "setup" || totpStep === "fetching") && (
									<form onSubmit={startTotpSetup} className="flex flex-col gap-2.5">
										<div>
											<Label className="block mb-1.5">Current password</Label>
											<Input
												type="password"
												value={totpPassword}
												onChange={(e) => setTotpPassword(e.target.value)}
												required
												disabled={totpStep === "fetching"}
												placeholder="Enter your password"
												autoComplete="current-password"
											/>
										</div>
										{totpMessage && (
											<Alert variant="destructive">
												<AlertDescription>{totpMessage}</AlertDescription>
											</Alert>
										)}
										<div className="flex gap-2">
											<Button type="submit" size="sm" disabled={totpStep === "fetching"}>
												{totpStep === "fetching" && <Spinner size="xs" />}
												{totpStep === "fetching" ? "Generating…" : "Generate QR Code"}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={totpStep === "fetching"}
												onClick={() => {
													setTotpStep("idle");
													setTotpMessage("");
													setTotpPassword("");
												}}
											>
												Cancel
											</Button>
										</div>
									</form>
								)}

								{(totpStep === "ready" || totpStep === "confirming") && (
									<div className="flex flex-col gap-3">
										<p className="text-xs text-muted-foreground">
											Scan this QR code with your authenticator app, then enter the 6-digit
											code to confirm.
										</p>
										{totpQrDataUrl && (
											<div className="flex justify-center p-3 bg-white rounded-xl">
												<img
													src={totpQrDataUrl}
													alt="TOTP QR code"
													width={160}
													height={160}
													className="rounded"
												/>
											</div>
										)}
										<div>
											<p className="text-[11px] font-semibold text-muted-foreground mb-1">
												Manual entry key
											</p>
											<code className="block text-xs font-mono text-foreground bg-muted/50 px-2.5 py-1.5 rounded-lg break-all select-all">
												{totpSecret}
											</code>
										</div>
										<form onSubmit={confirmTotp} className="flex flex-col gap-2.5">
											<div>
												<Label className="block mb-1.5">6-digit code</Label>
												<Input
													type="text"
													inputMode="numeric"
													pattern="[0-9]{6}"
													maxLength={6}
													value={totpCode}
													onChange={(e) =>
														setTotpCode(e.target.value.replace(/\D/g, ""))
													}
													required
													disabled={totpStep === "confirming"}
													placeholder="000000"
													autoComplete="one-time-code"
													className="text-center tracking-widest text-lg font-mono"
												/>
											</div>
											{totpMessage && (
												<Alert variant="destructive">
													<AlertDescription>{totpMessage}</AlertDescription>
												</Alert>
											)}
											<div className="flex gap-2">
												<Button
													type="submit"
													size="sm"
													disabled={
														totpStep === "confirming" || totpCode.length !== 6
													}
												>
													{totpStep === "confirming" ? (
														<Spinner size="xs" />
													) : (
														<IconShieldCheck size={12} />
													)}
													Activate
												</Button>
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => {
														setTotpStep("idle");
														setTotpCode("");
														setTotpMessage("");
														setTotpSecret("");
														setTotpQrDataUrl("");
														setTotpPassword("");
													}}
												>
													Cancel
												</Button>
											</div>
										</form>
									</div>
								)}

								{totpStep === "done" && (
									<Alert variant="success">
										<IconShieldCheck size={13} />
										<AlertDescription className="flex items-center justify-between">
											{totpMessage}
											<button
												onClick={() => setTotpStep("idle")}
												className="text-green/60 hover:text-green cursor-pointer ml-2"
											>
												<IconX size={13} />
											</button>
										</AlertDescription>
									</Alert>
								)}
							</div>

							{/* Refresh */}
							<Button variant="ghost" size="sm" className="self-start" onClick={fetchInfo}>
								<IconRefresh size={13} />
								Refresh
							</Button>
						</div>
					) : (
						<p className="text-muted-foreground text-sm">Failed to load account info.</p>
					)}
				</div>
			</div>
		</div>
	);
}
