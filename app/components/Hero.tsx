interface HeroProps {
	lastUpdated: string | null;
}

export default function Hero({ lastUpdated }: HeroProps) {
	return (
		<div className="mb-11 animate-fade-up">
			<p className="text-xs font-medium tracking-widest uppercase text-blue-500 mb-3">
				dell-xps-nixos-serv
			</p>
			<h1
				className="text-4xl md:text-5xl font-normal leading-tight tracking-tight text-gray-900 mb-2"
				style={{ fontFamily: "'Playfair Display', serif" }}
			>
				Home server
			</h1>
			<p className="text-sm text-gray-400 font-light">
				{lastUpdated
					? `Last updated ${new Date(lastUpdated).toLocaleTimeString()}`
					: "Fetching system stats..."}
			</p>
		</div>
	);
}
