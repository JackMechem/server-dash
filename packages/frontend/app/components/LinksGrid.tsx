import { LINKS } from "../lib/links";
import LinkCard from "./LinkCard";

export default function LinksGrid() {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="text-lg font-medium tracking-tight text-foreground" style={{ lineHeight: "normal", marginTop: 0 }}>
          Services &amp; Apps
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
        {LINKS.map((link, i) => (
          <LinkCard key={link.name} link={link} delay={i * 60} />
        ))}
      </div>
    </div>
  );
}
