"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import SideNav from "../components/SideNav";
import HelpTooltip from "../components/HelpTooltip";
import {
	IconSearch,
	IconX,
	IconKey,
	IconTrash,
	IconPlus,
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
	created_at?: string;
}

interface User {
	username: string;
	credentials: Credential[];
}

type EnrollStatus = "idle" | "starting" | "waiting_yubikey" | "saving" | "done" | "error";

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
	const [enrollPassword, setEnrollPassword] = useState("");
	const [enrollStatus, setEnrollStatus] = useState<EnrollStatus>("idle");
	const [enrollMessage, setEnrollMessage] = useState("");
	const [deletingId, setDeletingId] = useState<string | null>(null);
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
		const onUp = () => {
			isDragging.current = false;
		};
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
		setEnrollStatus("idle");
		setEnrollMessage("");
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

	const enrollKey = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!selected) return;
		setEnrollStatus("starting");
		setEnrollMessage("");

		try {
			const startRes = await fetch(
				`/api/users/${selected.username}/enroll/start`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ password: enrollPassword }),
				},
			);

			if (!startRes.ok) {
				setEnrollMessage("Invalid password.");
				setEnrollStatus("error");
				return;
			}

			const { session_id, challenge } = await startRes.json();

			setEnrollStatus("waiting_yubikey");
			const opts = challenge.publicKey;
			opts.challenge = b64uToBuf(opts.challenge);
			opts.user.id = b64uToBuf(opts.user.id);
			opts.authenticatorSelection = {
				authenticatorAttachment: "cross-platform",
				residentKey: "discouraged",
				requireResidentKey: false,
				userVerification: "discouraged",
			};
			(opts as Record<string, unknown>).hints = ["security-key"];
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
					"YubiKey error: " + (err instanceof Error ? err.message : "cancelled"),
				);
				setEnrollStatus("error");
				return;
			}

			setEnrollStatus("saving");
			const attestation = cred.response as AuthenticatorAttestationResponse;

			const finishRes = await fetch(
				`/api/users/${selected.username}/enroll/finish`,
				{
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
			setEnrollMessage("YubiKey enrolled successfully.");
			setEnrollPassword("");
			await fetchUsers();
		} catch {
			setEnrollMessage("Something went wrong. Try again.");
			setEnrollStatus("error");
		}
	};

	const filtered = (users ?? []).filter((u) =>
		u.username.toLowerCase().includes(search.toLowerCase()),
	);

	const enrollBusy = enrollStatus !== "idle" && enrollStatus !== "error";

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
									return (
										<div
											key={user.username}
											onClick={() => selectUser(user)}
											className={
												"flex items-center justify-between gap-[10px] px-[10px] py-[9px] rounded-xl cursor-pointer transition-colors m-[2px] " +
												(active
													? "bg-blue/20 shadow-sm shadow-blue/10"
													: "hover:bg-secondary/50")
											}
										>
											<div className="flex items-center gap-[10px] min-w-0">
												<div
													className={
														"w-[28px] h-[28px] rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold " +
														(active
															? "bg-blue text-primary"
															: "bg-secondary text-foreground-sec")
													}
												>
													{user.username[0]?.toUpperCase()}
												</div>
												<span
													className={
														"text-[13px] font-semibold truncate " +
														(active ? "text-blue" : "text-foreground")
													}
												>
													{user.username}
												</span>
											</div>
											<span
												className={
													"text-[10px] font-bold tracking-wider py-[2px] px-[8px] rounded-full shrink-0 " +
													(active
														? "bg-blue/30 text-blue"
														: "bg-secondary text-foreground-sec")
												}
											>
												{user.credentials.length}{" "}
												{user.credentials.length === 1 ? "key" : "keys"}
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
					onMouseDown={(e) => {
						isDragging.current = true;
						e.preventDefault();
					}}
					className="w-[10px] shrink-0 flex items-center justify-center cursor-col-resize group"
				>
					<div className="w-[3px] h-[40px] rounded-full bg-blue/20 group-hover:bg-blue/50 transition-colors" />
				</div>

				{/* Right panel — credential management */}
				<div className="flex-1 overflow-y-auto min-w-0 h-full">
					{selected ? (
						<div className="p-[25px] flex flex-col gap-[22px]">
							{/* User header */}
							<div>
								<div className="flex items-center gap-[12px]">
									<div className="w-[38px] h-[38px] rounded-full bg-blue/20 flex items-center justify-center text-[15px] font-bold text-blue shrink-0">
										{selected.username[0]?.toUpperCase()}
									</div>
									<div>
										<p className="text-[18px] font-bold text-foreground" style={{ lineHeight: "normal", fontSize: "18px", fontWeight: 700 }}>
											{selected.username}
										</p>
										<p className="text-[11px] text-foreground-sec" style={{ lineHeight: "normal", fontSize: "11px" }}>
											{selected.credentials.length} security{" "}
											{selected.credentials.length === 1 ? "key" : "keys"} enrolled
										</p>
									</div>
								</div>
								<div className="h-px bg-secondary mt-[16px]" />
							</div>

							{/* Enrolled keys */}
							<div>
								<div className="flex items-center gap-[8px] mb-[10px]">
									<span className="text-[10px] font-bold tracking-wider text-foreground-sec uppercase">
										Enrolled Keys
									</span>
									<div className="flex-1 h-px bg-secondary" />
									<span className="text-[10px] text-foreground-sec">
										{selected.credentials.length}
									</span>
								</div>

								{selected.credentials.length === 0 ? (
									<div className="flex items-center gap-[8px] px-[12px] py-[10px] rounded-xl bg-secondary/30 text-foreground-sec">
										<IconKey size={13} />
										<span className="text-[12px]">No keys enrolled</span>
									</div>
								) : (
									<div className="flex flex-col gap-[5px]">
										{selected.credentials.map((cred) => (
											<div
												key={cred.id}
												className="flex items-center gap-[10px] px-[12px] py-[9px] rounded-xl bg-secondary/30 group"
											>
												<IconKey size={13} className="text-blue shrink-0" />
												<div className="flex flex-col gap-[1px] flex-1 min-w-0">
													<span className="text-[12px] font-mono text-foreground truncate">
														{truncId(cred.id)}
													</span>
													{fmtDate(cred.created_at) && (
														<span className="text-[10px] text-foreground-sec">
															{fmtDate(cred.created_at)}
														</span>
													)}
												</div>
												<HelpTooltip text="Remove this YubiKey credential. The user will no longer be able to log in with it.">
												<button
													onClick={() => deleteCredential(cred.id)}
													disabled={deletingId === cred.id}
													title="Remove key"
													className="p-[5px] rounded-[7px] text-foreground-sec hover:text-red-400 hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer disabled:opacity-50 shrink-0"
												>
													{deletingId === cred.id ? (
														<span className="w-[13px] h-[13px] border-2 border-current border-t-transparent rounded-full inline-block animate-spin" />
													) : (
														<IconTrash size={13} />
													)}
												</button>
												</HelpTooltip>
											</div>
										))}
									</div>
								)}
							</div>

							{/* Enroll new key */}
							<div>
								<div className="flex items-center gap-[8px] mb-[10px]">
									<span className="text-[10px] font-bold tracking-wider text-foreground-sec uppercase">
										Enroll New Key
									</span>
									<div className="flex-1 h-px bg-secondary" />
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
												Password for {selected.username}
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

										{enrollStatus === "waiting_yubikey" && (
											<p className="text-[12px] text-blue text-center animate-pulse">
												Touch your YubiKey…
											</p>
										)}
										{enrollStatus === "error" && enrollMessage && (
											<p className="text-[12px] text-red-400">{enrollMessage}</p>
										)}

										<HelpTooltip text="Start the YubiKey enrollment flow — you'll be prompted to touch the key to register it.">
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
											{enrollStatus === "idle" || enrollStatus === "error"
												? "Enroll YubiKey"
												: enrollStatus === "starting"
												? "Starting…"
												: enrollStatus === "waiting_yubikey"
												? "Touch YubiKey…"
												: "Saving…"}
										</button>
										</HelpTooltip>
									</form>
								)}
							</div>
						</div>
					) : (
						<div className="h-full flex items-center justify-center text-foreground-sec text-[13px]">
							Select a user
						</div>
					)}
				</div>
			</div>

			{/* Mobile — stacked */}
			<div className="lg:hidden flex-1 overflow-y-auto pt-[52px]">
				{/* User list */}
				<div className="p-[10px] border-b border-secondary">
					<div className="flex items-center gap-[8px] bg-secondary/50 rounded-[10px] px-[10px] py-[6px]">
						<IconSearch size={13} className="text-foreground-sec shrink-0" />
						<input
							type="text"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search users…"
							className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-foreground-sec outline-none"
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
											"flex items-center justify-between gap-[10px] px-[10px] py-[9px] rounded-xl cursor-pointer transition-colors " +
											(open ? "bg-blue/20" : "hover:bg-secondary/50")
										}
									>
										<div className="flex items-center gap-[10px]">
											<div
												className={
													"w-[28px] h-[28px] rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 " +
													(open
														? "bg-blue text-primary"
														: "bg-secondary text-foreground-sec")
												}
											>
												{user.username[0]?.toUpperCase()}
											</div>
											<span
												className={
													"text-[13px] font-semibold " +
													(open ? "text-blue" : "text-foreground")
												}
											>
												{user.username}
											</span>
										</div>
										<span
											className={
												"text-[10px] font-bold tracking-wider py-[2px] px-[8px] rounded-full " +
												(open
													? "bg-blue/30 text-blue"
													: "bg-secondary text-foreground-sec")
											}
										>
											{user.credentials.length} {user.credentials.length === 1 ? "key" : "keys"}
										</span>
									</div>

									{open && (
										<div className="mx-[4px] mb-[8px] px-[10px] py-[12px] rounded-xl bg-secondary/20 flex flex-col gap-[14px]">
											{/* Keys */}
											<div>
												<p className="text-[10px] font-bold tracking-wider text-foreground-sec uppercase mb-[8px]">
													Enrolled Keys
												</p>
												{user.credentials.length === 0 ? (
													<p className="text-[12px] text-foreground-sec">No keys enrolled.</p>
												) : (
													<div className="flex flex-col gap-[5px]">
														{user.credentials.map((cred) => (
															<div
																key={cred.id}
																className="flex items-center gap-[8px] px-[10px] py-[8px] rounded-xl bg-secondary/40"
															>
																<IconKey size={12} className="text-blue shrink-0" />
																<span className="text-[11px] font-mono text-foreground flex-1 truncate">
																	{truncId(cred.id)}
																</span>
																<button
																	onClick={() => deleteCredential(cred.id)}
																	disabled={deletingId === cred.id}
																	className="p-[4px] rounded-[6px] text-foreground-sec hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer"
																>
																	{deletingId === cred.id ? (
																		<span className="w-[12px] h-[12px] border-2 border-current border-t-transparent rounded-full inline-block animate-spin" />
																	) : (
																		<IconTrash size={12} />
																	)}
																</button>
															</div>
														))}
													</div>
												)}
											</div>

											{/* Enroll */}
											<div>
												<p className="text-[10px] font-bold tracking-wider text-foreground-sec uppercase mb-[8px]">
													Enroll New Key
												</p>
												{enrollStatus === "done" ? (
													<p className="text-[12px] text-green font-semibold">{enrollMessage}</p>
												) : (
													<form onSubmit={enrollKey} className="flex flex-col gap-[8px]">
														<input
															type="password"
															value={enrollPassword}
															onChange={(e) => setEnrollPassword(e.target.value)}
															required
															disabled={enrollBusy}
															placeholder={`Password for ${user.username}`}
															className="w-full px-[10px] py-[7px] bg-secondary/50 border border-secondary rounded-xl text-[12px] text-foreground outline-none"
														/>
														{enrollStatus === "waiting_yubikey" && (
															<p className="text-[11px] text-blue animate-pulse text-center">
																Touch your YubiKey…
															</p>
														)}
														{enrollStatus === "error" && enrollMessage && (
															<p className="text-[11px] text-red-400">{enrollMessage}</p>
														)}
														<button
															type="submit"
															disabled={enrollBusy}
															className="flex items-center justify-center gap-[6px] px-[12px] py-[6px] rounded-xl text-[12px] font-bold bg-blue/10 border border-blue/30 text-blue hover:bg-blue/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
														>
															<IconPlus size={12} />
															{enrollBusy ? "Working…" : "Enroll YubiKey"}
														</button>
													</form>
												)}
											</div>
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
