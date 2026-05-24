"use client";

import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const INTERVAL_UNITS: { value: string; label: string }[] = [
	{ value: "minute", label: "min"   },
	{ value: "hour",   label: "hour"  },
	{ value: "day",    label: "day"   },
	{ value: "week",   label: "week"  },
	{ value: "month",  label: "month" },
	{ value: "year",   label: "year"  },
];

export const INTERVAL_N_PRESETS = [
	1, 5, 10, 15, 20, 25, 30, 35, 40, 45,
	50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
];

export default function IntervalPicker({
	n, unit, onNChange, onUnitChange,
	units = INTERVAL_UNITS,
	presets = INTERVAL_N_PRESETS,
	maxN = 100,
	mobile,
}: {
	n: number;
	unit: string;
	onNChange: (n: number) => void;
	onUnitChange: (unit: string) => void;
	units?: { value: string; label: string }[];
	presets?: number[];
	maxN?: number;
	mobile?: boolean;
}) {
	const [nIsCustom, setNIsCustom] = useState(() => !presets.includes(n));

	const size = mobile ? "default" : "sm";

	const nOptions = [
		...presets.map(p => ({ value: String(p), label: String(p) })),
		{ value: "custom", label: "Custom…" },
	];

	return (
		<div className="flex gap-1.5">
			{/* Number */}
			{nIsCustom ? (
				<Input
					type="text"
					inputMode="numeric"
					pattern="[0-9]*"
					value={n}
					autoFocus
					onChange={e => onNChange(Math.min(maxN, Math.max(1, parseInt(e.target.value.replace(/\D/g, "")) || 1)))}
					onBlur={() => { if (presets.includes(n)) setNIsCustom(false); }}
					className={cn("no-spinner text-center px-2", mobile ? "w-[68px]" : "w-[54px]")}
				/>
			) : (
				<Select
					value={String(n)}
					onValueChange={v => {
						if (v === "custom") { setNIsCustom(true); return; }
						onNChange(parseInt(v));
					}}
					options={nOptions}
					size={size}
					className={mobile ? "w-[68px]" : "w-[54px]"}
				/>
			)}

			{/* Unit */}
			<Select
				value={unit}
				onValueChange={onUnitChange}
				options={units}
				size={size}
				className="flex-1"
			/>
		</div>
	);
}
