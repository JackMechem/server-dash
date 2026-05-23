"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import SideNav from "../components/SideNav";
import HelpTooltip from "../components/HelpTooltip";
import {
	IconSearch,
	IconX,
	IconKey,
	IconTrash,
	IconPlus,
	IconShieldCheck,
	IconShieldOff,
	IconPencil,
	IconCheck,
} from "@tabler/icons-react";

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
	created_at?: string;
}

interface User {
	username: string;
	credentials: Credential[];
	has_totp: boolean;
}

type EnrollType = "security-key" | "passkey";
type EnrollStatus = "idle" | "starting" | "waiting_key" | "saving" | "done" | "error";
type TotpStep = "idle" | "setup" | "fetching" | "ready" | "confirming" | "done";

const truncId = (id: string) =>
	id.length > 20 ? id.slice(0, 10) + "…" + id.slice(-6) : id;

const fmtDate = (iso?: string) => {
	if (!iso) return null;
	try {
		return new Date(iso).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			year: "2-digit",
		});
	} catch {
		return null;
	}
};

export default function UsersPage() {
	const [users, setUsers] = useState<User[] | null>(null);
	const [selected, setSelected] = useState<User | null>(null);
	const [search, setSearch] = useState("");

	// WebAuthn enrollment
	const [enrollType, setEnrollType] = useState<EnrollType>("security-key");
	const [enrollPassword, setEnrollPassword] = useState("");
	const [enrollLabel, setEnrollLabel] = useState("");
	const [enrollStatus, setEnrollStatus] = useState<EnrollStatus>("idle");
	const [enrollMessage, setEnrollMessage] = useState("");
	const [deletingId, setDeletingId] = useState<string | null>(null);

	// Credential label editing
	const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
	const [editingLabelValue, setEditingLabelValue] = useState("");
	const [savingLabelId, setSavingLabelId] = useState<string | null>(null);

	// TOTP
	const [totpStep, setTotpStep] = useState<TotpStep>("idle");
	const [totpPassword, setTotpPassword] = useState("");
	const [totpSecret, setTotpSecret] = useState("");
	const [totpUri, setTotpUri] = useState("");
	const [totpQrDataUrl, setTotpQrDataUrl] = useState("");
	const [totpCode, setTotpCode] = useState("");
	const [totpMessage, setTotpMessage] = useState("");
	const [removingTotp, setRemovingTotp] = useState(false);

	const [leftPct, setLeftPct] = useState(35);
	const isDragging = useRef(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const fetchUsers = useCallback(async () => {
		const res = await fetch("/api/users");
		if (!res.ok) return;
		const data = await res.json();
		const list: User[] = data.users ?? data;
		setUsers(list);
		setSelected((prev) => {
			const match = prev ? list.find((u) => u.username === prev.username) : null;
			return match ?? list[0] ?? null;
		});
	}, []);

	useEffect(() => {
		fetchUsers();
	}, [fetchUsers]);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			if (!isDragging.current || !containerRef.current) return;
			const rect = containerRef.current.getBoundingClientRect();
			const pct = ((e.clientX - rect.left) / rect.width) * 100;
			setLeftPct(Math.min(Math.max(pct, 20), 60));
		};
		const onUp = () => { isDragging.current = false; };
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
		return () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
		};
	}, []);

	const selectUser = (user: User) => {
		setSelected(user);
		setEnrollPassword("");
		setEnrollLabel("");
		setEnrollStatus("idle");
		setEnrollMessage("");
		setEditingLabelId(null);
		setEditingLabelValue("");
		setTotpStep("idle");
		setTotpPassword("");
		setTotpSecret("");
		setTotpUri("");
		setTotpQrDataUrl("");
		setTotpCode("");
		setTotpMessage("");
	};

	const deleteCredential = async (credId: string) => {
		if (!selected) return;
		setDeletingId(credId);
		await fetch(`/api/users/${selected.username}/credentials/${credId}`, {
			method: "DELETE",
		});
		setDeletingId(null);
		await fetchUsers();
	};

	const saveLabel = async (credId: string) => {
		if (!selected) return;
		setSavingLabelId(credId);
		await fetch(`/api/users/${selected.username}/credentials/${credId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ label: editingLabelValue }),
		});
		setSavingLabelId(null);
		setEditingLabelId(null);
		await fetchUsers();
	};

	const enrollKey = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!selected) return;
		setEnrollStatus("starting");
		setEnrollMessage("");

		try {
			const startRes = await fetch(`/api/users/${selected.username}/enroll/start`, {
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

			if (enrollType === "passkey") {
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
				cred = (await navigator.credentials.create({ publicKey: opts })) as PublicKeyCredential;
			} catch (err) {
				setEnrollMessage(
					(enrollType === "passkey" ? "Passkey" : "YubiKey") +
					" error: " + (err instanceof Error ? err.message : "cancelled"),
				);
				setEnrollStatus("error");
				return;
			}

			setEnrollStatus("saving");
			const attestation = cred.response as AuthenticatorAttestationResponse;

			const finishRes = await fetch(`/api/users/${selected.username}/enroll/finish`, {
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
			});

			if (!finishRes.ok) {
				setEnrollMessage("Registration failed. Check server logs.");
				setEnrollStatus("error");
				return;
			}

			setEnrollStatus("done");
			setEnrollMessage(
				enrollType === "passkey" ? "Passkey enrolled successfully." : "YubiKey enrolled successfully.",
			);
			setEnrollPassword("");
			setEnrollLabel("");
			await fetchUsers();
		} catch {
			setEnrollMessage("Something went wrong. Try again.");
			setEnrollStatus("error");
		}
	};

	const startTotpSetup = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!selected) return;
		setTotpStep("fetching");
		setTotpMessage("");

		const res = await fetch(`/api/users/${selected.username}/totp/setup`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ password: totpPassword }),
		});

		if (!res.ok) {
			setTotpMessage("Invalid password.");
			setTotpStep("idle");
			return;
		}

		const { secret, uri } = await res.json();
		setTotpSecret(secret);
		setTotpUri(uri);
		const dataUrl = await QRCode.toDataURL(uri, { width: 160, margin: 1, color: { dark: "#000", light: "#fff" } });
		setTotpQrDataUrl(dataUrl);
		setTotpStep("ready");
	};

	const confirmTotp = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!selected) return;
		setTotpStep("confirming");
		setTotpMessage("");

		const res = await fetch(`/api/users/${selected.username}/totp/confirm`, {
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
		await fetchUsers();
	};

	const removeTotp = async () => {
		if (!selected) return;
		setRemovingTotp(true);
		await fetch(`/api/users/${selected.username}/totp`, { method: "DELETE" });
		setRemovingTotp(false);
		setTotpStep("idle");
		await fetchUsers();
	};

	const filtered = (users ?? []).filter((u) =>
		u.username.toLowerCase().includes(search.toLowerCase()),
	);

	const enrollBusy = enrollStatus !== "idle" && enrollStatus !== "error" && enrollStatus !== "done";

	const renderCredentialPanel = (user: User) => (
		<div className="p-[25px] flex flex-col gap-[22px]">
			{/* User header */}
			<div>
				<div className="flex items-center gap-[12px]">
					<div className="w-[38px] h-[38px] rounded-full bg-blue/20 flex items-center justify-center text-[15px] font-bold text-blue shrink-0">
						{user.username[0]?.toUpperCase()}
					</div>
					<div>
						<p className="text-[18px] font-bold text-foreground" style={{ lineHeight: "normal", fontSize: "18px", fontWeight: 700 }}>
							{user.username}
						</p>
						<p className="text-[11px] text-foreground-sec" style={{ lineHeight: "normal", fontSize: "11px" }}>
							{user.credentials.length} credential{user.credentials.length !== 1 ? "s" : ""}
							{user.has_totp ? " · TOTP configured" : ""}
						</p>
					</div>
				</div>
				<div className="h-px bg-secondary mt-[16px]" />
			</div>

			{/* Enrolled credentials */}
			<div>
				<div className="flex items-center gap-[8px] mb-[10px]">
					<span className="text-[10px] font-bold tracking-wider text-foreground-sec uppercase">
						Enrolled Credentials
					</span>
					<div className="flex-1 h-px bg-secondary" />
					<span className="text-[10px] text-foreground-sec">{user.credentials.length}</span>
				</div>

				{user.credentials.length === 0 ? (
					<div className="flex items-center gap-[8px] px-[12px] py-[10px] rounded-xl bg-secondary/30 text-foreground-sec">
						<IconKey size={13} />
						<span className="text-[12px]">No keys or passkeys enrolled</span>
					</div>
				) : (
					<div className="flex flex-col gap-[5px]">
						{user.credentials.map((cred) => {
							const isEditing = editingLabelId === cred.id;
							const isSaving = savingLabelId === cred.id;
							return (
								<div key={cred.id} className="flex items-center gap-[10px] px-[12px] py-[11px] rounded-xl bg-secondary/30 group">
									<IconKey size={13} className="text-blue shrink-0" />
									<div className="flex flex-col gap-[1px] flex-1 min-w-0">
										{isEditing ? (
											<form
												onSubmit={(e) => { e.preventDefault(); saveLabel(cred.id); }}
												className="flex items-center gap-[6px]"
											>
												<input
													autoFocus
													type="text"
													value={editingLabelValue}
													onChange={(e) => setEditingLabelValue(e.target.value)}
													placeholder="Name this credential…"
													maxLength={64}
													disabled={isSaving}
													className="flex-1 min-w-0 px-[8px] py-[3px] bg-secondary border border-blue/40 rounded-lg text-[12px] text-foreground outline-none focus:border-blue/70 transition-colors"
												/>
												<button
													type="submit"
													disabled={isSaving}
													className="p-[8px] lg:p-[4px] rounded-[6px] text-blue hover:bg-blue/10 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
												>
													{isSaving ? (
														<span className="w-[12px] h-[12px] border-2 border-current border-t-transparent rounded-full inline-block animate-spin" />
													) : (
														<IconCheck size={12} />
													)}
												</button>
												<button
													type="button"
													disabled={isSaving}
													onClick={() => setEditingLabelId(null)}
													className="p-[8px] lg:p-[4px] rounded-[6px] text-foreground-sec hover:text-foreground hover:bg-secondary/70 transition-colors cursor-pointer shrink-0"
												>
													<IconX size={12} />
												</button>
											</form>
										) : (
											<>
												<span className={`text-[12px] truncate ${cred.label ? "text-foreground font-medium" : "text-foreground-sec font-mono"}`}>
													{cred.label ?? truncId(cred.id)}
												</span>
												{cred.label && (
													<span className="text-[10px] text-foreground-sec font-mono truncate">
														{truncId(cred.id)}
													</span>
												)}
											</>
										)}
									</div>
									{!isEditing && (
										<HelpTooltip text="Rename this credential.">
											<button
												onClick={() => { setEditingLabelId(cred.id); setEditingLabelValue(cred.label ?? ""); }}
												className="p-[8px] lg:p-[5px] rounded-[7px] text-foreground-sec hover:text-blue hover:bg-blue/10 transition-colors lg:opacity-0 lg:group-hover:opacity-100 cursor-pointer shrink-0"
											>
												<IconPencil size={14} />
											</button>
										</HelpTooltip>
									)}
									{!isEditing && (
										<HelpTooltip text="Remove this credential. The user will no longer be able to log in with it.">
											<button
												onClick={() => deleteCredential(cred.id)}
												disabled={deletingId === cred.id}
												className="p-[8px] lg:p-[5px] rounded-[7px] text-foreground-sec hover:text-red-400 hover:bg-red-400/10 transition-colors lg:opacity-0 lg:group-hover:opacity-100 cursor-pointer disabled:opacity-50 shrink-0"
											>
												{deletingId === cred.id ? (
													<span className="w-[13px] h-[13px] border-2 border-current border-t-transparent rounded-full inline-block animate-spin" />
												) : (
													<IconTrash size={13} />
												)}
											</button>
										</HelpTooltip>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>

			{/* TOTP section */}
			<div>
				<div className="flex items-center gap-[8px] mb-[10px]">
					<span className="text-[10px] font-bold tracking-wider text-foreground-sec uppercase">
						Authenticator App
					</span>
					<div className="flex-1 h-px bg-secondary" />
				</div>

				{user.has_totp && totpStep !== "idle" ? null : user.has_totp ? (
					<div className="flex items-center gap-[10px] px-[12px] py-[9px] rounded-xl bg-secondary/30">
						<IconShieldCheck size={13} className="text-green shrink-0" />
						<span className="text-[12px] text-foreground flex-1">TOTP configured</span>
						<HelpTooltip text="Remove the authenticator app (TOTP) from this account.">
							<button
								onClick={removeTotp}
								disabled={removingTotp}
								className="flex items-center gap-[5px] px-[8px] py-[4px] rounded-[7px] text-[11px] text-red-400 border border-red-400/20 hover:bg-red-400/10 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
							>
								{removingTotp ? (
									<span className="w-[10px] h-[10px] border-2 border-current border-t-transparent rounded-full inline-block animate-spin" />
								) : (
									<IconTrash size={11} />
								)}
								Remove
							</button>
						</HelpTooltip>
					</div>
				) : totpStep === "done" ? (
					<div className="flex items-center gap-[8px] px-[12px] py-[10px] rounded-xl bg-green/10 text-green text-[12px] font-semibold">
						<IconShieldCheck size={13} />
						{totpMessage}
						<button
							onClick={() => setTotpStep("idle")}
							className="ml-auto text-green/60 hover:text-green cursor-pointer"
						>
							<IconX size={13} />
						</button>
					</div>
				) : totpStep === "idle" ? (
					<div className="flex items-center gap-[10px] px-[12px] py-[9px] rounded-xl bg-secondary/30">
						<IconShieldOff size={13} className="text-foreground-sec shrink-0" />
						<span className="text-[12px] text-foreground-sec flex-1">Not configured</span>
						<button
							onClick={() => setTotpStep("setup")}
							className="flex items-center gap-[5px] px-[8px] py-[4px] rounded-[7px] text-[11px] text-blue border border-blue/20 hover:bg-blue/10 transition-colors cursor-pointer shrink-0"
						>
							<IconPlus size={11} />
							Set up
						</button>
					</div>
				) : totpStep === "setup" || totpStep === "fetching" ? (
					<form onSubmit={startTotpSetup} className="flex flex-col gap-[10px]">
						<div>
							<label className="block text-[10px] tracking-wider text-foreground-sec uppercase mb-[6px]">
								Password for {user.username}
							</label>
							<input
								type="password"
								value={totpPassword}
								onChange={(e) => setTotpPassword(e.target.value)}
								required
								disabled={totpStep === "fetching"}
								placeholder="Enter user password"
								autoComplete="current-password"
								className="w-full px-[12px] py-[8px] bg-secondary/50 border border-secondary rounded-xl text-[13px] text-foreground outline-none focus:border-blue/50 transition-colors disabled:opacity-50"
							/>
						</div>
						{totpMessage && <p className="text-[12px] text-red-400">{totpMessage}</p>}
						<div className="flex gap-[8px]">
							<button
								type="submit"
								disabled={totpStep === "fetching"}
								className="flex items-center gap-[6px] px-[12px] py-[7px] rounded-xl text-[12px] font-bold bg-blue/10 border border-blue/30 text-blue hover:bg-blue/20 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{totpStep === "fetching" ? (
									<span className="w-[12px] h-[12px] border-2 border-current border-t-transparent rounded-full inline-block animate-spin" />
								) : null}
								{totpStep === "fetching" ? "Generating…" : "Generate QR Code"}
							</button>
							<button
								type="button"
								disabled={totpStep === "fetching"}
								onClick={() => { setTotpStep("idle"); setTotpMessage(""); setTotpPassword(""); }}
								className="px-[12px] py-[7px] rounded-xl text-[12px] text-foreground-sec hover:text-foreground border border-secondary hover:bg-secondary/50 cursor-pointer transition-colors disabled:opacity-50"
							>
								Cancel
							</button>
						</div>
					</form>
				) : totpStep === "ready" || totpStep === "confirming" ? (
					<div className="flex flex-col gap-[12px]">
						<p className="text-[12px] text-foreground-sec">
							Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.
						</p>
						{totpQrDataUrl && (
							<div className="flex justify-center p-[12px] bg-white rounded-xl">
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
							<p className="text-[10px] tracking-wider text-foreground-sec uppercase mb-[4px]">
								Manual entry key
							</p>
							<code className="block text-[12px] font-mono text-foreground bg-secondary/50 px-[10px] py-[6px] rounded-lg break-all select-all">
								{totpSecret}
							</code>
						</div>
						<form onSubmit={confirmTotp} className="flex flex-col gap-[10px]">
							<div>
								<label className="block text-[10px] tracking-wider text-foreground-sec uppercase mb-[6px]">
									6-digit code
								</label>
								<input
									type="text"
									inputMode="numeric"
									pattern="[0-9]{6}"
									maxLength={6}
									value={totpCode}
									onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
									required
									disabled={totpStep === "confirming"}
									placeholder="000000"
									autoComplete="one-time-code"
									className="w-full px-[12px] py-[8px] bg-secondary/50 border border-secondary rounded-xl text-[14px] font-mono text-foreground text-center tracking-widest outline-none focus:border-blue/50 transition-colors disabled:opacity-50"
								/>
							</div>
							{totpMessage && <p className="text-[12px] text-red-400">{totpMessage}</p>}
							<div className="flex gap-[8px]">
								<button
									type="submit"
									disabled={totpStep === "confirming" || totpCode.length !== 6}
									className="flex items-center gap-[6px] px-[12px] py-[7px] rounded-xl text-[12px] font-bold bg-blue/10 border border-blue/30 text-blue hover:bg-blue/20 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{totpStep === "confirming" ? (
										<span className="w-[12px] h-[12px] border-2 border-current border-t-transparent rounded-full inline-block animate-spin" />
									) : (
										<IconShieldCheck size={12} />
									)}
									Activate
								</button>
								<button
									type="button"
									onClick={() => { setTotpStep("idle"); setTotpCode(""); setTotpMessage(""); setTotpSecret(""); setTotpUri(""); setTotpQrDataUrl(""); setTotpPassword(""); }}
									className="px-[12px] py-[7px] rounded-xl text-[12px] text-foreground-sec hover:text-foreground border border-secondary hover:bg-secondary/50 cursor-pointer transition-colors"
								>
									Cancel
								</button>
							</div>
						</form>
					</div>
				) : null}
			</div>

			{/* Enroll new credential */}
			<div>
				<div className="flex items-center gap-[8px] mb-[10px]">
					<span className="text-[10px] font-bold tracking-wider text-foreground-sec uppercase">
						Enroll New Credential
					</span>
					<div className="flex-1 h-px bg-secondary" />
				</div>

				{/* Type tabs */}
				<div className="flex gap-[4px] mb-[12px] p-[3px] bg-secondary/40 rounded-xl w-fit">
					{(["security-key", "passkey"] as EnrollType[]).map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => { setEnrollType(t); setEnrollStatus("idle"); setEnrollMessage(""); }}
							className={`px-[14px] py-[8px] rounded-[9px] text-[12px] font-semibold transition-colors cursor-pointer ${
								enrollType === t
									? "bg-blue text-white"
									: "text-foreground-sec hover:text-foreground"
							}`}
						>
							{t === "security-key" ? "YubiKey" : "Passkey"}
						</button>
					))}
				</div>

				{enrollStatus === "done" ? (
					<div className="flex items-center gap-[8px] px-[12px] py-[10px] rounded-xl bg-green/10 text-green text-[12px] font-semibold">
						{enrollMessage}
						<HelpTooltip text="Dismiss this success message.">
							<button
								onClick={() => setEnrollStatus("idle")}
								className="ml-auto text-green/60 hover:text-green cursor-pointer"
							>
								<IconX size={13} />
							</button>
						</HelpTooltip>
					</div>
				) : (
					<form onSubmit={enrollKey} className="flex flex-col gap-[10px]">
						<div>
							<label className="block text-[10px] tracking-wider text-foreground-sec uppercase mb-[6px]">
								Password for {user.username}
							</label>
							<input
								type="password"
								value={enrollPassword}
								onChange={(e) => setEnrollPassword(e.target.value)}
								required
								disabled={enrollBusy}
								placeholder="Enter user password"
								autoComplete="current-password"
								className="w-full px-[12px] py-[8px] bg-secondary/50 border border-secondary rounded-xl text-[13px] text-foreground outline-none focus:border-blue/50 transition-colors disabled:opacity-50"
							/>
						</div>
						<div>
							<label className="block text-[10px] tracking-wider text-foreground-sec uppercase mb-[6px]">
								Name <span className="normal-case text-foreground-sec/60">(optional)</span>
							</label>
							<input
								type="text"
								value={enrollLabel}
								onChange={(e) => setEnrollLabel(e.target.value)}
								disabled={enrollBusy}
								placeholder={enrollType === "passkey" ? "e.g. Bitwarden passkey" : "e.g. YubiKey 5C"}
								maxLength={64}
								className="w-full px-[12px] py-[8px] bg-secondary/50 border border-secondary rounded-xl text-[13px] text-foreground outline-none focus:border-blue/50 transition-colors disabled:opacity-50"
							/>
						</div>

						{enrollStatus === "waiting_key" && (
							<p className="text-[12px] text-blue text-center animate-pulse">
								{enrollType === "passkey"
									? "Complete passkey enrollment in your password manager…"
									: "Touch your YubiKey…"}
							</p>
						)}
						{enrollStatus === "error" && enrollMessage && (
							<p className="text-[12px] text-red-400">{enrollMessage}</p>
						)}

						<HelpTooltip
							text={
								enrollType === "passkey"
									? "Enroll a passkey from a password manager like Bitwarden."
									: "Start the YubiKey enrollment flow — you'll be prompted to touch the key."
							}
						>
							<button
								type="submit"
								disabled={enrollBusy}
								className={
									"flex items-center justify-center gap-[7px] w-fit px-[14px] py-[7px] rounded-xl text-[12px] font-bold border transition-colors " +
									(enrollBusy
										? "bg-blue/20 border-blue/20 text-blue/40 cursor-not-allowed"
										: "bg-blue/10 border-blue/30 text-blue hover:bg-blue/20 cursor-pointer")
								}
							>
								<IconPlus size={13} />
								{enrollBusy
									? enrollStatus === "starting"
										? "Starting…"
										: enrollStatus === "waiting_key"
										? enrollType === "passkey" ? "Waiting…" : "Touch key…"
										: "Saving…"
									: enrollType === "passkey"
									? "Enroll Passkey"
									: "Enroll YubiKey"}
							</button>
						</HelpTooltip>
					</form>
				)}
			</div>
		</div>
	);

	return (
		<div className="w-full h-full bg-primary text-foreground overflow-hidden flex flex-row">
			<SideNav online={false} devConsoleOpen={false} onToggleDevConsole={() => {}} isAuthed={true} />

			{/* Desktop split pane */}
			<div
				ref={containerRef}
				className="flex-1 overflow-hidden hidden lg:flex flex-row lg:m-[10px_10px_10px_0px] lg:rounded-2xl lg:border lg:border-blue/20 select-none"
			>
				{/* Left panel — user list */}
				<div
					className="h-full flex flex-col shrink-0 overflow-hidden border-r border-secondary"
					style={{ width: `${leftPct}%` }}
				>
					<div className="p-[10px] border-b border-secondary shrink-0">
						<div className="flex items-center gap-[8px] bg-secondary/50 rounded-[10px] px-[10px] py-[6px]">
							<IconSearch size={13} className="text-foreground-sec shrink-0" />
							<input
								type="text"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search users…"
								className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-foreground-sec outline-none"
							/>
							{search && (
								<HelpTooltip text="Clear the search filter.">
									<button
										onClick={() => setSearch("")}
										className="text-foreground-sec hover:text-foreground cursor-pointer"
									>
										<IconX size={12} />
									</button>
								</HelpTooltip>
							)}
						</div>
					</div>

					<div className="overflow-y-auto flex-1 min-h-0">
						{users === null ? (
							<div className="p-[8px] flex flex-col gap-[4px]">
								{[...Array(4)].map((_, i) => (
									<div key={i} className="skeleton h-[52px] rounded-xl" />
								))}
							</div>
						) : filtered.length === 0 ? (
							<p className="text-foreground-sec text-[12px] text-center py-[24px] px-[10px]">
								No users found.
							</p>
						) : (
							<div className="p-[5px] flex flex-col">
								{filtered.map((user) => {
									const active = selected?.username === user.username;
									const badge = user.credentials.length + (user.has_totp ? 1 : 0);
									return (
										<div
											key={user.username}
											onClick={() => selectUser(user)}
											className={
												"flex items-center justify-between gap-[10px] px-[10px] py-[9px] rounded-xl cursor-pointer transition-colors m-[2px] " +
												(active ? "bg-blue/20 shadow-sm shadow-blue/10" : "hover:bg-secondary/50")
											}
										>
											<div className="flex items-center gap-[10px] min-w-0">
												<div className={
													"w-[28px] h-[28px] rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold " +
													(active ? "bg-blue text-primary" : "bg-secondary text-foreground-sec")
												}>
													{user.username[0]?.toUpperCase()}
												</div>
												<span className={
													"text-[13px] font-semibold truncate " +
													(active ? "text-blue" : "text-foreground")
												}>
													{user.username}
												</span>
											</div>
											<span className={
												"text-[10px] font-bold tracking-wider py-[2px] px-[8px] rounded-full shrink-0 " +
												(active ? "bg-blue/30 text-blue" : "bg-secondary text-foreground-sec")
											}>
												{badge} {badge === 1 ? "method" : "methods"}
											</span>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</div>

				{/* Drag handle */}
				<div
					onMouseDown={(e) => { isDragging.current = true; e.preventDefault(); }}
					className="w-[10px] shrink-0 flex items-center justify-center cursor-col-resize group"
				>
					<div className="w-[3px] h-[40px] rounded-full bg-blue/20 group-hover:bg-blue/50 transition-colors" />
				</div>

				{/* Right panel */}
				<div className="flex-1 overflow-y-auto min-w-0 h-full">
					{selected ? (
						renderCredentialPanel(selected)
					) : (
						<div className="h-full flex items-center justify-center text-foreground-sec text-[13px]">
							Select a user
						</div>
					)}
				</div>
			</div>

			{/* Mobile — stacked */}
			<div className="lg:hidden flex-1 overflow-y-auto pt-[52px]">
				<div className="p-[10px] border-b border-secondary">
					<div className="flex items-center gap-[8px] bg-secondary/50 rounded-[10px] px-[12px] py-[10px]">
						<IconSearch size={16} className="text-foreground-sec shrink-0" />
						<input
							type="text"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search users…"
							className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-foreground-sec outline-none"
						/>
					</div>
				</div>

				<div className="p-[8px]">
					{users === null ? (
						<div className="flex flex-col gap-[4px]">
							{[...Array(3)].map((_, i) => (
								<div key={i} className="skeleton h-[52px] rounded-xl" />
							))}
						</div>
					) : (
						filtered.map((user) => {
							const open = selected?.username === user.username;
							return (
								<div key={user.username} className="mb-[4px]">
									<div
										onClick={() => selectUser(open ? { ...user } : user)}
										className={
											"flex items-center justify-between gap-[10px] px-[12px] py-[14px] rounded-xl cursor-pointer transition-colors " +
											(open ? "bg-blue/20" : "hover:bg-secondary/50")
										}
									>
										<div className="flex items-center gap-[12px]">
											<div className={
												"w-[36px] h-[36px] rounded-full flex items-center justify-center text-[14px] font-bold shrink-0 " +
												(open ? "bg-blue text-primary" : "bg-secondary text-foreground-sec")
											}>
												{user.username[0]?.toUpperCase()}
											</div>
											<span className={
												"text-[15px] font-semibold " +
												(open ? "text-blue" : "text-foreground")
											}>
												{user.username}
											</span>
										</div>
										<span className={
											"text-[11px] font-bold tracking-wider py-[4px] px-[10px] rounded-full " +
											(open ? "bg-blue/30 text-blue" : "bg-secondary text-foreground-sec")
										}>
											{user.credentials.length + (user.has_totp ? 1 : 0)} methods
										</span>
									</div>

									{open && (
										<div className="mx-[4px] mb-[8px] rounded-xl bg-secondary/20 overflow-hidden">
											{renderCredentialPanel(user)}
										</div>
									)}
								</div>
							);
						})
					)}
				</div>
			</div>
		</div>
	);
}
