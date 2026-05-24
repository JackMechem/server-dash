"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import SideNav from "../components/SideNav";
import HelpTooltip from "../components/HelpTooltip";
import {
	IconSearch,
	IconX,
	IconKey,
	IconTrash,
	IconShieldCheck,
	IconShieldOff,
	IconPencil,
	IconCheck,
	IconLock,
	IconChevronDown,
	IconChevronRight,
} from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/ui/section-label";
import { Spinner } from "@/components/ui/spinner";

interface Credential {
	id: string;
	label?: string;
}

interface User {
	username: string;
	credentials: Credential[];
	has_totp: boolean;
}

const truncId = (id: string) =>
	id.length > 20 ? id.slice(0, 10) + "…" + id.slice(-6) : id;

export default function UsersPage() {
	const [users, setUsers] = useState<User[] | null>(null);
	const [selected, setSelected] = useState<User | null>(null);
	const [search, setSearch] = useState("");

	// Password reset
	const [pwOpen, setPwOpen] = useState(false);
	const [newPw, setNewPw] = useState("");
	const [confirmPw, setConfirmPw] = useState("");
	const [pwMsg, setPwMsg] = useState("");
	const [pwErr, setPwErr] = useState(false);
	const [pwBusy, setPwBusy] = useState(false);

	// Credential management
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
	const [editingLabelValue, setEditingLabelValue] = useState("");
	const [savingLabelId, setSavingLabelId] = useState<string | null>(null);

	// TOTP removal
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
		setPwOpen(false);
		setNewPw("");
		setConfirmPw("");
		setPwMsg("");
		setPwErr(false);
		setEditingLabelId(null);
		setEditingLabelValue("");
	};

	const resetPassword = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!selected) return;
		if (newPw !== confirmPw) {
			setPwMsg("Passwords do not match.");
			setPwErr(true);
			return;
		}
		if (newPw.length < 1) {
			setPwMsg("Password cannot be empty.");
			setPwErr(true);
			return;
		}
		setPwBusy(true);
		setPwMsg("");
		const res = await fetch(`/api/users/${encodeURIComponent(selected.username)}/password`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ new_password: newPw }),
		});
		setPwBusy(false);
		if (!res.ok) {
			setPwMsg("Failed to reset password.");
			setPwErr(true);
		} else {
			setPwMsg("Password reset successfully.");
			setPwErr(false);
			setNewPw("");
			setConfirmPw("");
		}
	};

	const deleteCredential = async (credId: string) => {
		if (!selected) return;
		setDeletingId(credId);
		await fetch(`/api/users/${encodeURIComponent(selected.username)}/credentials/${credId}`, {
			method: "DELETE",
		});
		setDeletingId(null);
		await fetchUsers();
	};

	const saveLabel = async (credId: string) => {
		if (!selected) return;
		setSavingLabelId(credId);
		await fetch(
			`/api/users/${encodeURIComponent(selected.username)}/credentials/${credId}`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ label: editingLabelValue }),
			},
		);
		setSavingLabelId(null);
		setEditingLabelId(null);
		await fetchUsers();
	};

	const removeTotp = async () => {
		if (!selected) return;
		setRemovingTotp(true);
		await fetch(`/api/users/${encodeURIComponent(selected.username)}/totp`, {
			method: "DELETE",
		});
		setRemovingTotp(false);
		await fetchUsers();
	};

	const filtered = (users ?? []).filter((u) =>
		u.username.toLowerCase().includes(search.toLowerCase()),
	);

	const renderRightPanel = (user: User) => (
		<div className="p-[25px] flex flex-col gap-[22px]">
			{/* User header */}
			<div>
				<div className="flex items-center gap-3">
					<div className="w-[38px] h-[38px] rounded-full bg-primary/20 flex items-center justify-center text-[15px] font-bold text-primary shrink-0">
						{user.username[0]?.toUpperCase()}
					</div>
					<div>
						<p className="text-[18px] font-bold text-foreground" style={{ lineHeight: "normal" }}>
							{user.username}
						</p>
						<p className="text-[11px] text-muted-foreground" style={{ lineHeight: "normal" }}>
							{user.credentials.length} credential{user.credentials.length !== 1 ? "s" : ""}
							{user.has_totp ? " · TOTP configured" : ""}
						</p>
					</div>
				</div>
				<div className="h-px bg-border mt-4" />
			</div>

			{/* Reset password */}
			<div>
				<button
					type="button"
					onClick={() => { setPwOpen((o) => !o); setPwMsg(""); setPwErr(false); setNewPw(""); setConfirmPw(""); }}
					className="flex items-center gap-2 w-full group mb-2.5"
				>
					<SectionLabel divider className="flex-1 cursor-pointer">
						<IconLock size={12} className="mr-1.5 opacity-60" />
						Reset Password
					</SectionLabel>
					{pwOpen
						? <IconChevronDown size={13} className="text-muted-foreground shrink-0" />
						: <IconChevronRight size={13} className="text-muted-foreground shrink-0" />
					}
				</button>

				{pwOpen && (
					<form onSubmit={resetPassword} className="flex flex-col gap-2.5">
						<div>
							<Label className="block mb-1.5">New password</Label>
							<Input
								type="password"
								value={newPw}
								onChange={(e) => setNewPw(e.target.value)}
								required
								disabled={pwBusy}
								autoComplete="new-password"
								placeholder="New password"
							/>
						</div>
						<div>
							<Label className="block mb-1.5">Confirm password</Label>
							<Input
								type="password"
								value={confirmPw}
								onChange={(e) => setConfirmPw(e.target.value)}
								required
								disabled={pwBusy}
								autoComplete="new-password"
								placeholder="Confirm new password"
							/>
						</div>
						{pwMsg && (
							<Alert variant={pwErr ? "destructive" : "success"}>
								<AlertDescription>{pwMsg}</AlertDescription>
							</Alert>
						)}
						<div className="flex gap-2">
							<Button type="submit" size="sm" disabled={pwBusy}>
								{pwBusy ? <Spinner size="xs" /> : <IconCheck size={12} />}
								{pwBusy ? "Resetting…" : "Reset Password"}
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={pwBusy}
								onClick={() => { setPwOpen(false); setPwMsg(""); setNewPw(""); setConfirmPw(""); }}
							>
								Cancel
							</Button>
						</div>
					</form>
				)}
			</div>

			{/* Security keys */}
			<div>
				<SectionLabel divider className="mb-2.5">
					Security Keys
					<span className="ml-auto text-[10px] text-muted-foreground font-normal normal-case tracking-normal">
						{user.credentials.length}
					</span>
				</SectionLabel>

				{user.credentials.length === 0 ? (
					<div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted/30 text-muted-foreground">
						<IconKey size={13} />
						<span className="text-xs">No keys or passkeys enrolled</span>
					</div>
				) : (
					<div className="flex flex-col gap-[5px]">
						{user.credentials.map((cred) => {
							const isEditing = editingLabelId === cred.id;
							const isSaving = savingLabelId === cred.id;
							return (
								<div
									key={cred.id}
									className="flex items-center gap-2.5 px-3 py-[11px] rounded-xl bg-muted/30 group"
								>
									<IconKey size={13} className="text-primary shrink-0" />
									<div className="flex flex-col gap-[1px] flex-1 min-w-0">
										{isEditing ? (
											<form
												onSubmit={(e) => { e.preventDefault(); saveLabel(cred.id); }}
												className="flex items-center gap-1.5"
											>
												<input
													autoFocus
													type="text"
													value={editingLabelValue}
													onChange={(e) => setEditingLabelValue(e.target.value)}
													placeholder="Name this credential…"
													maxLength={64}
													disabled={isSaving}
													className="flex-1 min-w-0 px-2 py-1 bg-muted border border-primary/40 rounded-lg text-xs text-foreground outline-none focus:border-primary/70 transition-colors"
												/>
												<button
													type="submit"
													disabled={isSaving}
													className="p-2 lg:p-1 rounded-md text-primary hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
												>
													{isSaving ? <Spinner size="xs" /> : <IconCheck size={12} />}
												</button>
												<button
													type="button"
													disabled={isSaving}
													onClick={() => setEditingLabelId(null)}
													className="p-2 lg:p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
												>
													<IconX size={12} />
												</button>
											</form>
										) : (
											<>
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
											</>
										)}
									</div>
									{!isEditing && (
										<HelpTooltip text="Rename this credential.">
											<button
												onClick={() => {
													setEditingLabelId(cred.id);
													setEditingLabelValue(cred.label ?? "");
												}}
												className="p-2 lg:p-[5px] rounded-[7px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors lg:opacity-0 lg:group-hover:opacity-100 cursor-pointer shrink-0"
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
												className="p-2 lg:p-[5px] rounded-[7px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors lg:opacity-0 lg:group-hover:opacity-100 cursor-pointer disabled:opacity-50 shrink-0"
											>
												{deletingId === cred.id ? (
													<Spinner size="xs" />
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

			{/* TOTP */}
			<div>
				<SectionLabel divider className="mb-2.5">
					Authenticator App (TOTP)
				</SectionLabel>

				{user.has_totp ? (
					<div className="flex items-center gap-2.5 px-3 py-[9px] rounded-xl bg-muted/30">
						<IconShieldCheck size={13} className="text-green shrink-0" />
						<span className="text-xs text-foreground flex-1">TOTP configured</span>
						<HelpTooltip text="Remove the authenticator app (TOTP) from this account.">
							<Button
								variant="destructive"
								size="xs"
								onClick={removeTotp}
								disabled={removingTotp}
							>
								{removingTotp ? <Spinner size="xs" /> : <IconTrash size={11} />}
								Remove
							</Button>
						</HelpTooltip>
					</div>
				) : (
					<div className="flex items-center gap-2 px-3 py-[9px] rounded-xl bg-muted/30 text-muted-foreground">
						<IconShieldOff size={13} className="shrink-0" />
						<span className="text-xs flex-1">Not configured</span>
					</div>
				)}
			</div>
		</div>
	);

	return (
		<div className="w-full h-full bg-background text-foreground overflow-hidden flex flex-row">
			<SideNav online={false} isAuthed={true} />

			{/* Desktop split pane */}
			<div
				ref={containerRef}
				className="flex-1 overflow-hidden hidden lg:flex flex-row lg:m-[10px_10px_10px_0px] lg:rounded-2xl lg:border lg:border-primary/20 select-none"
			>
				{/* Left panel — user list */}
				<div
					className="h-full flex flex-col shrink-0 overflow-hidden border-r border-border"
					style={{ width: `${leftPct}%` }}
				>
					<div className="p-2.5 border-b border-border shrink-0">
						<div className="flex items-center gap-2 bg-muted/50 rounded-[10px] px-2.5 py-1.5">
							<IconSearch size={13} className="text-muted-foreground shrink-0" />
							<input
								type="text"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search users…"
								className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
							/>
							{search && (
								<HelpTooltip text="Clear the search filter.">
									<button
										onClick={() => setSearch("")}
										className="text-muted-foreground hover:text-foreground cursor-pointer"
									>
										<IconX size={12} />
									</button>
								</HelpTooltip>
							)}
						</div>
					</div>

					<div className="overflow-y-auto flex-1 min-h-0">
						{users === null ? (
							<div className="p-2 flex flex-col gap-1">
								{[...Array(4)].map((_, i) => (
									<Skeleton key={i} className="h-[52px] rounded-xl" />
								))}
							</div>
						) : filtered.length === 0 ? (
							<p className="text-muted-foreground text-xs text-center py-6 px-2.5">
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
												"flex items-center justify-between gap-2.5 px-2.5 py-[9px] rounded-xl cursor-pointer transition-colors m-0.5 " +
												(active
													? "bg-primary/20 shadow-sm shadow-primary/10"
													: "hover:bg-muted/50")
											}
										>
											<div className="flex items-center gap-2.5 min-w-0">
												<div
													className={
														"w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold " +
														(active
															? "bg-primary text-background"
															: "bg-muted text-muted-foreground")
													}
												>
													{user.username[0]?.toUpperCase()}
												</div>
												<span
													className={
														"text-[13px] font-semibold truncate " +
														(active ? "text-primary" : "text-foreground")
													}
												>
													{user.username}
												</span>
											</div>
											<span
												className={
													"text-[10px] font-bold tracking-wider py-0.5 px-2 rounded-full shrink-0 " +
													(active
														? "bg-primary/30 text-primary"
														: "bg-muted text-muted-foreground")
												}
											>
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
					onMouseDown={(e) => {
						isDragging.current = true;
						e.preventDefault();
					}}
					className="w-[10px] shrink-0 flex items-center justify-center cursor-col-resize group"
				>
					<div className="w-[3px] h-[40px] rounded-full bg-primary/20 group-hover:bg-primary/50 transition-colors" />
				</div>

				{/* Right panel */}
				<div className="flex-1 overflow-y-auto min-w-0 h-full">
					{selected ? (
						renderRightPanel(selected)
					) : (
						<div className="h-full flex items-center justify-center text-muted-foreground text-sm">
							Select a user
						</div>
					)}
				</div>
			</div>

			{/* Mobile — stacked */}
			<div className="lg:hidden flex-1 overflow-y-auto pt-[52px]">
				<div className="p-2.5 border-b border-border">
					<div className="flex items-center gap-2 bg-muted/50 rounded-[10px] px-3 py-2.5">
						<IconSearch size={16} className="text-muted-foreground shrink-0" />
						<input
							type="text"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search users…"
							className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
						/>
					</div>
				</div>

				<div className="p-2">
					{users === null ? (
						<div className="flex flex-col gap-1">
							{[...Array(3)].map((_, i) => (
								<Skeleton key={i} className="h-[52px] rounded-xl" />
							))}
						</div>
					) : (
						filtered.map((user) => {
							const open = selected?.username === user.username;
							return (
								<div key={user.username} className="mb-1">
									<div
										onClick={() => selectUser(open ? { ...user } : user)}
										className={
											"flex items-center justify-between gap-2.5 px-3 py-3.5 rounded-xl cursor-pointer transition-colors " +
											(open ? "bg-primary/20" : "hover:bg-muted/50")
										}
									>
										<div className="flex items-center gap-3">
											<div
												className={
													"w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 " +
													(open
														? "bg-primary text-background"
														: "bg-muted text-muted-foreground")
												}
											>
												{user.username[0]?.toUpperCase()}
											</div>
											<span
												className={
													"text-[15px] font-semibold " +
													(open ? "text-primary" : "text-foreground")
												}
											>
												{user.username}
											</span>
										</div>
										<span
											className={
												"text-[11px] font-bold tracking-wider py-1 px-2.5 rounded-full " +
												(open
													? "bg-primary/30 text-primary"
													: "bg-muted text-muted-foreground")
											}
										>
											{user.credentials.length + (user.has_totp ? 1 : 0)} methods
										</span>
									</div>

									{open && (
										<div className="mx-1 mb-2 rounded-xl bg-muted/20 overflow-hidden">
											{renderRightPanel(user)}
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
