import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { DataProvider } from "./lib/DataProvider";
import { TooltipProvider } from "@/components/ui/tooltip";

const jetbrains = JetBrains_Mono({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-jetbrains",
});

const noFlashScript = `(function(){try{var raw=localStorage.getItem("theme");var v="light";if(raw==="dark"||raw==="light"||raw==="black"){v=raw}else{try{v=JSON.parse(raw).state.theme}catch(e){}}if(v==="dark"){document.documentElement.classList.add("dark-theme")}else if(v==="black"){document.documentElement.classList.add("black-theme")}}catch(e){}})();`;

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#f0f5fc" },
		{ media: "(prefers-color-scheme: dark)", color: "#20232c" },
	],
};

export const metadata: Metadata = {
	title: "Server Dashboard",
	description: "My server dashboard",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			className={jetbrains.variable}
			suppressHydrationWarning
		>
			<head>
				<script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
			</head>
			<body className={jetbrains.className + " bg-background overflow-hidden"}>
				<TooltipProvider>
					<DataProvider>
						{children}
					</DataProvider>
				</TooltipProvider>
				<span className="fixed bottom-3 right-4 text-[10px] text-muted-foreground/40 select-none pointer-events-none">
					v0.1.0
				</span>
			</body>
		</html>
	);
}
