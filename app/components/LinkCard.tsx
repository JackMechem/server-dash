import { type AppLink } from "../lib/links";

interface LinkCardProps {
  link: AppLink;
  delay?: number;
}

export default function LinkCard({ link, delay = 0 }: LinkCardProps) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col gap-2 hover:shadow-md hover:-translate-y-1 hover:border-blue-200 transition-all duration-200 animate-fade-up no-underline text-inherit"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center text-2xl mb-1">
        {link.icon}
      </div>
      <span className="text-base font-medium text-gray-900">{link.name}</span>
      <span className="text-sm text-gray-400 font-light">{link.description}</span>
      <span className="mt-auto pt-2 text-sm font-medium text-blue-500">
        Open app →
      </span>
    </a>
  );
}
