import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useCheckAuth() {
	const router = useRouter();

	useEffect(() => {
		async function check() {
			const res = await fetch("/api/auth/check");
			console.log(res);
			if (!res.ok) {
				console.log("Invalid tokin");
				router.push(
					"/auth?callbackUrl=" + encodeURIComponent(window.location.pathname),
				);
			}
		}
		check();
	}, [router]);
}
