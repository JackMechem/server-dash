import { readFileSync } from "fs";
import { parse } from "smol-toml";

interface AppConfig {
	useDefaultConfig?: boolean;
	features?: {
		tapo?: boolean;
		enrollment_open?: boolean;
	};
	tapo?: {
		username?: string;
		password?: string;
		subnet?: string;
	};
	server?: {
		dellserv_ip?: string;
	};
}

const CONFIG_PATH = "/etc/server-dash/config.toml";

let cached: AppConfig | undefined;

function loadConfig(): AppConfig {
	if (cached !== undefined) return cached;
	try {
		const text = readFileSync(CONFIG_PATH, "utf-8");
		const parsed = parse(text) as AppConfig;
		// When useDefaultConfig is true, treat as empty config (all defaults).
		cached = parsed.useDefaultConfig ? {} : parsed;
	} catch {
		cached = {};
	}
	return cached;
}

export function isEnrollmentOpen(): boolean {
	return loadConfig().features?.enrollment_open ?? false;
}

export function getDellservIp(): string | undefined {
	return loadConfig().server?.dellserv_ip;
}
