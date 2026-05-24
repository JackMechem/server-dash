"use client";

import { useState, useEffect, useCallback } from "react";
import SideNav from "../components/SideNav";
import {
	IconUser,
	IconLock,
	IconLink,
	IconCheck,
	IconAlertCircle,
	IconRefresh,
} from "@tabler/icons-react";

interface AccountInfo {
	username: string;
	system_user: string | null;
	permission_level: string;
	has_app_credential: boolean;
}

type Section = "create" | "username" | "password" | "system-user";

function StatusMessage({
	message,
	isError,
}: {
	message: string;
	isError: boolean;
}) {
	if (!message) return null;
	return (
		<div
			className={`flex items-center gap-[8px] px-[12px] py-[9px] rounded-xl text-[12px] font-medium ${
				isError
					? "bg-red-400/10 text-red-400 border border-red-400/20"
					: "bg-green/10 text-green border border-green/20"
			}`}
		>
			{isError ? <IconAlertCircle size={13} /> : <IconCheck size={13} />}
			{message}
		</div>
	);
}

function SectionHeader({ label }: { label: string }) {
	return (
		<div className="flex items-center gap-[8px] mb-[14px]">
			<span className="text-[10px] font-bold tracking-wider text-foreground-sec uppercase">
				{label}
			</span>
			<div className="flex-1 h-px bg-secondary" />
		</div>
	);
}

export default function AccountPage() {
	const [info, setInfo] = useState<AccountInfo | null>(null);
	const [loading, setLoading] = useState(true);
	const [activeSection, setActiveSection] = useState<Section | null>(null);

	// Create credential form
	const [createUsername, setCreateUsername] = useState("");
	const [createPassword, setCreatePassword] = useState("");
	const [createConfirm, setCreateConfirm] = useState("");
	const [createSysUser, setCreateSysUser] = useState("");
	const [createSysPassword, setCreateSysPassword] = useState("");
	const [createMsg, setCreateMsg] = useState("");
	const [createErr, setCreateErr] = useState(false);
	const [createBusy, setCreateBusy] = useState(false);

	// Change username form
	const [newUsername, setNewUsername] = useState("");
	const [usernamePassword, setUsernamePassword] = useState("");
	const [usernameMsg, setUsernameMsg] = useState("");
	const [usernameErr, setUsernameErr] = useState(false);
	const [usernameBusy, setUsernameBusy] = useState(false);

	// Change password form
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [passwordMsg, setPasswordMsg] = useState("");
	const [passwordErr, setPasswordErr] = useState(false);
	const [passwordBusy, setPasswordBusy] = useState(false);

	// Change system user form
	const [newSysUser, setNewSysUser] = useState("");
	const [sysUserPassword, setSysUserPassword] = useState("");
	const [sysUserMsg, setSysUserMsg] = useState("");
	const [sysUserErr, setSysUserErr] = useState(false);
	const [sysUserBusy, setSysUserBusy] = useState(false);

	const fetchInfo = useCallback(async () => {
		setLoading(true);
		const res = await fetch("/api/account");
		if (res.ok) {
			const data = await res.json();
			setInfo(data);
			if (!data.has_app_credential) setActiveSection("create");
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		fetchInfo();
	}, [fetchInfo]);

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		if (createPassword !== createConfirm) {
			setCreateMsg("Passwords do not match.");
			setCreateErr(true);
			return;
		}
		setCreateBusy(true);
		setCreateMsg("");
		const res = await fetch("/api/account", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				app_username: createUsername,
				app_password: createPassword,
				system_user: createSysUser || null,
				system_password: createSysPassword || null,
			}),
		});
		const data = await res.json().catch(() => ({}));
		setCreateBusy(false);
		if (!res.ok) {
			setCreateMsg(data.error ?? "Failed to create credentials.");
			setCreateErr(true);
		} else {
			setCreateMsg("App credentials created. Log out and back in to use your new username.");
			setCreateErr(false);
			setCreatePassword("");
			setCreateConfirm("");
			setCreateSysPassword("");
			await fetchInfo();
			setActiveSection(null);
		}
	};

	const handleUsernameChange = async (e: React.FormEvent) => {
		e.preventDefault();
		setUsernameBusy(true);
		setUsernameMsg("");
		const res = await fetch("/api/account", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				new_username: newUsername,
				current_password: usernamePassword,
			}),
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
			body: JSON.stringify({
				current_password: currentPassword,
				new_password: newPassword,
			}),
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

	const handleSysUserChange = async (e: React.FormEvent) => {
		e.preventDefault();
		setSysUserBusy(true);
		setSysUserMsg("");
		const res = await fetch("/api/account", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				system_user: newSysUser,
				system_password: sysUserPassword,
			}),
		});
		const data = await res.json().catch(() => ({}));
		setSysUserBusy(false);
		if (!res.ok) {
			setSysUserMsg(data.error ?? "Failed to update linked system user.");
			setSysUserErr(true);
		} else {
			setSysUserMsg("Linked system user updated.");
			setSysUserErr(false);
			setNewSysUser("");
			setSysUserPassword("");
			await fetchInfo();
		}
	};

	const inputClass =
		"w-full px-[12px] py-[8px] bg-secondary/50 border border-secondary rounded-xl text-[13px] text-foreground outline-none focus:border-blue/50 transition-colors disabled:opacity-50";
	const labelClass =
		"block text-[10px] tracking-wider text-foreground-sec uppercase mb-[6px]";
	const submitClass =
		"flex items-center gap-[6px] px-[14px] py-[7px] rounded-xl text-[12px] font-bold bg-blue/10 border border-blue/30 text-blue hover:bg-blue/20 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
	const cancelClass =
		"px-[14px] py-[7px] rounded-xl text-[12px] text-foreground-sec hover:text-foreground border border-secondary hover:bg-secondary/50 cursor-pointer transition-colors";

	return (
		<div className="w-full h-full bg-primary text-foreground overflow-hidden flex flex-row">
			<SideNav online={false} devConsoleOpen={false} onToggleDevConsole={() => {}} isAuthed={true} />

			<div className="flex-1 overflow-y-auto lg:m-[10px_10px_10px_0px] lg:rounded-2xl lg:border lg:border-blue/20">
				<div className="max-w-[560px] mx-auto px-[20px] py-[32px]">
					{/* Header */}
					<div className="mb-[28px]">
						<h1 className="text-[22px] font-bold text-foreground">Account</h1>
						<p className="text-[13px] text-foreground-sec mt-[4px]">
							Manage your app credentials and system user link.
						</p>
					</div>

					{loading ? (
						<div className="flex flex-col gap-[10px]">
							{[...Array(3)].map((_, i) => (
								<div key={i} className="skeleton h-[60px] rounded-xl" />
							))}
						</div>
					) : info ? (
						<div className="flex flex-col gap-[24px]">
							{/* Current info card */}
							{info.has_app_credential && (
								<div className="flex flex-col gap-[10px] p-[16px] rounded-2xl bg-secondary/30 border border-secondary">
									<SectionHeader label="Current Credentials" />
									<div className="grid grid-cols-[auto_1fr] gap-x-[16px] gap-y-[8px] text-[13px]">
										<span className="text-foreground-sec">App username</span>
										<span className="font-semibold text-foreground">{info.username}</span>
										<span className="text-foreground-sec">Linked system user</span>
										<span className="font-semibold text-foreground">
											{info.system_user ?? <span className="text-foreground-sec italic">none</span>}
										</span>
										<span className="text-foreground-sec">Permission level</span>
										<span className="font-mono text-[12px] px-[8px] py-[1px] rounded-full bg-blue/10 text-blue w-fit">
											{info.permission_level}
										</span>
									</div>
								</div>
							)}

							{/* Set up app credentials (no app credential yet) */}
							{!info.has_app_credential && (
								<div className="p-[20px] rounded-2xl border border-blue/20 bg-blue/5">
									<SectionHeader label="Set Up App Credentials" />
									<p className="text-[12px] text-foreground-sec mb-[16px]">
										You are currently logged in using your system account. Create a separate
										app username and password to decouple your login from the system account.
									</p>
									<form onSubmit={handleCreate} className="flex flex-col gap-[12px]">
										<div>
											<label className={labelClass}>App username</label>
											<input
												type="text"
												value={createUsername}
												onChange={(e) => setCreateUsername(e.target.value)}
												required
												disabled={createBusy}
												maxLength={64}
												placeholder="e.g. admin"
												className={inputClass}
											/>
										</div>
										<div>
											<label className={labelClass}>App password</label>
											<input
												type="password"
												value={createPassword}
												onChange={(e) => setCreatePassword(e.target.value)}
												required
												disabled={createBusy}
												autoComplete="new-password"
												className={inputClass}
											/>
										</div>
										<div>
											<label className={labelClass}>Confirm app password</label>
											<input
												type="password"
												value={createConfirm}
												onChange={(e) => setCreateConfirm(e.target.value)}
												required
												disabled={createBusy}
												autoComplete="new-password"
												className={inputClass}
											/>
										</div>
										<div className="h-px bg-secondary" />
										<div>
											<label className={labelClass}>
											Linked system user{" "}
											<span className="normal-case text-foreground-sec/60">(optional)</span>
										</label>
											<input
												type="text"
												value={createSysUser}
												onChange={(e) => setCreateSysUser(e.target.value)}
												disabled={createBusy}
												placeholder="e.g. jackm"
												className={inputClass}
											/>
										</div>
										<div>
											<label className={labelClass}>
												System user password{" "}
												<span className="normal-case text-foreground-sec/60">(required if linking)</span>
											</label>
											<input
												type="password"
												value={createSysPassword}
												onChange={(e) => setCreateSysPassword(e.target.value)}
												disabled={createBusy || !createSysUser}
												autoComplete="current-password"
												className={inputClass}
											/>
										</div>
										<StatusMessage message={createMsg} isError={createErr} />
										<button type="submit" disabled={createBusy} className={submitClass}>
											{createBusy ? (
												<span className="w-[12px] h-[12px] border-2 border-current border-t-transparent rounded-full inline-block animate-spin" />
											) : (
												<IconCheck size={12} />
											)}
											{createBusy ? "Creating…" : "Create App Credentials"}
										</button>
									</form>
								</div>
							)}

							{/* Change username */}
							{info.has_app_credential && (
								<div>
									<SectionHeader label="Change Username" />
									{activeSection === "username" ? (
										<form onSubmit={handleUsernameChange} className="flex flex-col gap-[10px]">
											<div>
												<label className={labelClass}>New username</label>
												<input
													type="text"
													value={newUsername}
													onChange={(e) => setNewUsername(e.target.value)}
													required
													disabled={usernameBusy}
													maxLength={64}
													placeholder="New app username"
													className={inputClass}
												/>
											</div>
											<div>
												<label className={labelClass}>Current password</label>
												<input
													type="password"
													value={usernamePassword}
													onChange={(e) => setUsernamePassword(e.target.value)}
													required
													disabled={usernameBusy}
													autoComplete="current-password"
													className={inputClass}
												/>
											</div>
											<StatusMessage message={usernameMsg} isError={usernameErr} />
											<div className="flex gap-[8px]">
												<button type="submit" disabled={usernameBusy} className={submitClass}>
													{usernameBusy ? (
														<span className="w-[12px] h-[12px] border-2 border-current border-t-transparent rounded-full inline-block animate-spin" />
													) : (
														<IconUser size={12} />
													)}
													{usernameBusy ? "Saving…" : "Update Username"}
												</button>
												<button
													type="button"
													disabled={usernameBusy}
													onClick={() => { setActiveSection(null); setUsernameMsg(""); }}
													className={cancelClass}
												>
													Cancel
												</button>
											</div>
										</form>
									) : (
										<div className="flex items-center justify-between px-[14px] py-[10px] rounded-xl bg-secondary/30">
											<div className="flex items-center gap-[10px]">
												<IconUser size={14} className="text-foreground-sec" />
												<span className="text-[13px] text-foreground">{info.username}</span>
											</div>
											<button
												onClick={() => { setActiveSection("username"); setUsernameMsg(""); }}
												className="text-[12px] text-blue hover:text-blue/80 cursor-pointer font-medium"
											>
												Change
											</button>
										</div>
									)}
									{activeSection !== "username" && usernameMsg && (
										<div className="mt-[8px]">
											<StatusMessage message={usernameMsg} isError={usernameErr} />
										</div>
									)}
								</div>
							)}

							{/* Change password */}
							{info.has_app_credential && (
								<div>
									<SectionHeader label="Change Password" />
									{activeSection === "password" ? (
										<form onSubmit={handlePasswordChange} className="flex flex-col gap-[10px]">
											<div>
												<label className={labelClass}>Current password</label>
												<input
													type="password"
													value={currentPassword}
													onChange={(e) => setCurrentPassword(e.target.value)}
													required
													disabled={passwordBusy}
													autoComplete="current-password"
													className={inputClass}
												/>
											</div>
											<div>
												<label className={labelClass}>New password</label>
												<input
													type="password"
													value={newPassword}
													onChange={(e) => setNewPassword(e.target.value)}
													required
													disabled={passwordBusy}
													autoComplete="new-password"
													className={inputClass}
												/>
											</div>
											<div>
												<label className={labelClass}>Confirm new password</label>
												<input
													type="password"
													value={confirmPassword}
													onChange={(e) => setConfirmPassword(e.target.value)}
													required
													disabled={passwordBusy}
													autoComplete="new-password"
													className={inputClass}
												/>
											</div>
											<StatusMessage message={passwordMsg} isError={passwordErr} />
											<div className="flex gap-[8px]">
												<button type="submit" disabled={passwordBusy} className={submitClass}>
													{passwordBusy ? (
														<span className="w-[12px] h-[12px] border-2 border-current border-t-transparent rounded-full inline-block animate-spin" />
													) : (
														<IconLock size={12} />
													)}
													{passwordBusy ? "Saving…" : "Update Password"}
												</button>
												<button
													type="button"
													disabled={passwordBusy}
													onClick={() => { setActiveSection(null); setPasswordMsg(""); }}
													className={cancelClass}
												>
													Cancel
												</button>
											</div>
										</form>
									) : (
										<div className="flex items-center justify-between px-[14px] py-[10px] rounded-xl bg-secondary/30">
											<div className="flex items-center gap-[10px]">
												<IconLock size={14} className="text-foreground-sec" />
												<span className="text-[13px] text-foreground-sec">••••••••</span>
											</div>
											<button
												onClick={() => { setActiveSection("password"); setPasswordMsg(""); }}
												className="text-[12px] text-blue hover:text-blue/80 cursor-pointer font-medium"
											>
												Change
											</button>
										</div>
									)}
									{activeSection !== "password" && passwordMsg && (
										<div className="mt-[8px]">
											<StatusMessage message={passwordMsg} isError={passwordErr} />
										</div>
									)}
								</div>
							)}

							{/* Change linked system user */}
							{info.has_app_credential && (
								<div>
									<SectionHeader label="Linked System User" />
									{activeSection === "system-user" ? (
										<form onSubmit={handleSysUserChange} className="flex flex-col gap-[10px]">
											<div>
												<label className={labelClass}>System username</label>
												<input
													type="text"
													value={newSysUser}
													onChange={(e) => setNewSysUser(e.target.value)}
													required
													disabled={sysUserBusy}
													placeholder="e.g. jackm"
													className={inputClass}
												/>
											</div>
											<div>
												<label className={labelClass}>System user password (to verify)</label>
												<input
													type="password"
													value={sysUserPassword}
													onChange={(e) => setSysUserPassword(e.target.value)}
													required
													disabled={sysUserBusy}
													autoComplete="current-password"
													className={inputClass}
												/>
											</div>
											<StatusMessage message={sysUserMsg} isError={sysUserErr} />
											<div className="flex gap-[8px]">
												<button type="submit" disabled={sysUserBusy} className={submitClass}>
													{sysUserBusy ? (
														<span className="w-[12px] h-[12px] border-2 border-current border-t-transparent rounded-full inline-block animate-spin" />
													) : (
														<IconLink size={12} />
													)}
													{sysUserBusy ? "Saving…" : "Update System User"}
												</button>
												<button
													type="button"
													disabled={sysUserBusy}
													onClick={() => { setActiveSection(null); setSysUserMsg(""); }}
													className={cancelClass}
												>
													Cancel
												</button>
											</div>
										</form>
									) : (
										<div className="flex items-center justify-between px-[14px] py-[10px] rounded-xl bg-secondary/30">
											<div className="flex items-center gap-[10px]">
												<IconLink size={14} className="text-foreground-sec" />
												<span className="text-[13px] text-foreground">
													{info.system_user ?? <span className="italic text-foreground-sec">not linked</span>}
												</span>
											</div>
											<button
												onClick={() => { setActiveSection("system-user"); setSysUserMsg(""); }}
												className="text-[12px] text-blue hover:text-blue/80 cursor-pointer font-medium"
											>
												Change
											</button>
										</div>
									)}
									{activeSection !== "system-user" && sysUserMsg && (
										<div className="mt-[8px]">
											<StatusMessage message={sysUserMsg} isError={sysUserErr} />
										</div>
									)}
								</div>
							)}

							{/* Refresh */}
							<button
								onClick={fetchInfo}
								className="self-start flex items-center gap-[6px] text-[12px] text-foreground-sec hover:text-foreground transition-colors cursor-pointer"
							>
								<IconRefresh size={13} />
								Refresh
							</button>
						</div>
					) : (
						<p className="text-foreground-sec text-[13px]">Failed to load account info.</p>
					)}
				</div>
			</div>
		</div>
	);
}
