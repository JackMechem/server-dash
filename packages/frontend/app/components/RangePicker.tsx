"use client";

import { Select, type SelectOption } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type RangeUnit = "hours" | "days" | "months" | "years";

export const RANGE_UNIT_HOURS: Record<RangeUnit, number> = {
	hours: 1, days: 24, months: 720, years: 8760,
};

export function initRangeFromHours(h: number): { count: number; unit: RangeUnit } {
	if (h < 24)   return { count: h,                   unit: "hours"  };
	if (h < 720)  return { count: Math.round(h / 24),  unit: "days"   };
	if (h < 8760) return { count: Math.round(h / 720), unit: "months" };
	return          { count: Math.round(h / 8760),     unit: "years"  };
}

const UNITS: SelectOption[] = [
	{ value: "hours",  label: "Hours"  },
	{ value: "days",   label: "Days"   },
	{ value: "months", label: "Months" },
	{ value: "years",  label: "Years"  },
];

export default function RangePicker({
	count, unit,
	onCountChange, onUnitChange,
	mobile,
}: {
	count: number;
	unit: RangeUnit;
	onCountChange: (v: number) => void;
	onUnitChange: (u: RangeUnit) => void;
	mobile?: boolean;
}) {
	return (
		<div className="flex gap-1.5">
			<Input
				type="number"
				min={1}
				value={count}
				onChange={e => onCountChange(Math.max(1, parseInt(e.target.value) || 1))}
				className={cn("no-spinner text-center px-2", mobile ? "w-[68px]" : "w-[54px]")}
			/>
			<Select
				value={unit}
				onValueChange={v => onUnitChange(v as RangeUnit)}
				options={UNITS}
				size={mobile ? "default" : "sm"}
				className="flex-1"
			/>
		</div>
	);
}
