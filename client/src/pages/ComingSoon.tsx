import { Construction } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description?: string;
}

export default function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-youco-bronze/10 text-youco-bronze mb-4">
          <Construction size={22} />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">{title}</h2>
        <p className="text-sm text-gray-500">
          {description ?? "Coming soon. This module is part of the planned Step 4 build-out."}
        </p>
      </div>
    </div>
  );
}
