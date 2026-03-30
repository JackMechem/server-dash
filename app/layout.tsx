import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google"; // Import your specific fonts
import "./globals.css";

const dmSans = DM_Sans({
	variable: "--font-dm-sans",
	subsets: ["latin"],
	display: "swap",
});

const playfair = Playfair_Display({
	variable: "--font-playfair",
	subsets: ["latin"],
	display: "swap",
});

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
			className={`${dmSans.variable} ${playfair.variable} h-full antialiased`}
		>
			<body className="min-h-full h-full flex flex-col">{children}</body>
		</html>
	);
}
