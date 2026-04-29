import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import { useUser } from "@/hooks/useAuth";
import type { Doc } from "@shared/schema";

function useDocs() {
  return useQuery<Doc[]>({
    queryKey: ["/api/docs"],
    queryFn: async () => {
      const res = await fetch("/api/docs", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load docs");
      return res.json();
    },
  });
}

export default function DocsListPage() {
  const { data: user } = useUser();
  const canEdit = user?.role === "admin" || user?.role === "contributor";
  const { data: docs = [], isLoading, error } = useDocs();

  const byCategory = docs.reduce<Record<string, Doc[]>>((acc, d) => {
    (acc[d.category] = acc[d.category] || []).push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Operations notes, routine procedures, supplier templates. Editable in
          markdown by admins / contributors.
        </p>
        {canEdit && (
          <Link
            href="/docs/_new"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-youco-blue text-white text-sm rounded hover:opacity-90"
          >
            <Plus size={14} />
            New doc
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : error ? (
        <div className="text-sm text-red-500">{String(error)}</div>
      ) : docs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
          No docs yet. {canEdit && "Click New doc to add one."}
        </div>
      ) : (
        Object.entries(byCategory).map(([cat, items]) => (
          <section key={cat} className="bg-white border border-gray-200 rounded-lg">
            <h3 className="px-4 py-2 border-b border-gray-200 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {cat}
            </h3>
            <ul className="divide-y divide-gray-100">
              {items.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/docs/${d.slug}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                  >
                    <FileText size={16} className="text-gray-400" />
                    <span className="font-medium text-gray-900">{d.title}</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      Updated {new Date(d.updatedAt).toLocaleDateString("en-GB")}
                      {d.updatedBy ? ` by ${d.updatedBy}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
