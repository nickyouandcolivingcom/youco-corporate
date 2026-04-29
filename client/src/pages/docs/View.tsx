import { useState, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Pencil, Save, X, Trash2, ChevronLeft } from "lucide-react";
import type { Doc } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/hooks/useAuth";

interface DocForm {
  slug: string;
  title: string;
  category: string;
  sortOrder: number;
  body: string;
}

const EMPTY_FORM: DocForm = {
  slug: "",
  title: "",
  category: "General",
  sortOrder: 100,
  body: "",
};

function useDoc(slug: string, enabled: boolean) {
  return useQuery<Doc>({
    queryKey: ["/api/docs", slug],
    enabled,
    queryFn: async () => {
      const res = await fetch(`/api/docs/${encodeURIComponent(slug)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Doc not found");
      return res.json();
    },
  });
}

function useCreateDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (form: DocForm) => {
      const res = await apiRequest("POST", "/api/docs", form);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Create failed");
      }
      return res.json() as Promise<Doc>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/docs"] }),
  });
}

function useUpdateDoc(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (form: Partial<DocForm>) => {
      const res = await apiRequest(
        "PATCH",
        `/api/docs/${encodeURIComponent(slug)}`,
        form
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Update failed");
      }
      return res.json() as Promise<Doc>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/docs"] }),
  });
}

function useDeleteDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string) => {
      const res = await apiRequest("DELETE", `/api/docs/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Delete failed");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/docs"] }),
  });
}

export default function DocViewPage() {
  const [, params] = useRoute("/docs/:slug");
  const [, navigate] = useLocation();
  const slug = params?.slug ?? "";
  const isNew = slug === "_new";

  const { data: user } = useUser();
  const isAdmin = user?.role === "admin";
  const canEdit = user?.role === "admin" || user?.role === "contributor";

  const docQuery = useDoc(slug, !isNew);
  const createMut = useCreateDoc();
  const updateMut = useUpdateDoc(slug);
  const deleteMut = useDeleteDoc();

  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<DocForm>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (docQuery.data) {
      setForm({
        slug: docQuery.data.slug,
        title: docQuery.data.title,
        category: docQuery.data.category,
        sortOrder: docQuery.data.sortOrder,
        body: docQuery.data.body,
      });
    }
  }, [docQuery.data]);

  if (!isNew && docQuery.isLoading) {
    return <div className="text-sm text-gray-500">Loading…</div>;
  }
  if (!isNew && docQuery.error) {
    return (
      <div className="space-y-3">
        <Link href="/docs" className="text-sm text-youco-blue inline-flex items-center gap-1">
          <ChevronLeft size={14} /> Back to docs
        </Link>
        <p className="text-sm text-red-500">{String(docQuery.error)}</p>
      </div>
    );
  }

  async function handleSave() {
    if (isNew) {
      const created = await createMut.mutateAsync(form);
      navigate(`/docs/${created.slug}`);
      setEditing(false);
    } else {
      await updateMut.mutateAsync(form);
      setEditing(false);
    }
  }

  async function handleDelete() {
    await deleteMut.mutateAsync(slug);
    navigate("/docs");
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <Link
          href="/docs"
          className="text-sm text-youco-blue inline-flex items-center gap-1"
        >
          <ChevronLeft size={14} /> All docs
        </Link>
        {canEdit && !editing && !isNew && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-sm rounded hover:bg-gray-50"
            >
              <Pencil size={14} />
              Edit
            </button>
            {isAdmin && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 text-sm rounded hover:bg-red-50"
              >
                <Trash2 size={14} />
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Slug *
              </label>
              <input
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                disabled={!isNew}
                placeholder="energy-maintenance"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Category
              </label>
              <input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Energy"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Sort order
              </label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value, 10) || 100 }))
                }
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Body (markdown)
            </label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={24}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-youco-blue/30"
            />
            <p className="text-xs text-gray-400 mt-1">
              Markdown supported: headings (#), lists, **bold**, *italic*, `code`,
              tables. Preview on save.
            </p>
          </div>
          {(createMut.error || updateMut.error) && (
            <p className="text-sm text-red-600">
              {createMut.error?.message ?? updateMut.error?.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                if (isNew) navigate("/docs");
                else setEditing(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-sm rounded hover:bg-gray-50"
            >
              <X size={14} />
              Cancel
            </button>
            <button
              disabled={!form.slug || !form.title || createMut.isPending || updateMut.isPending}
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-youco-blue text-white text-sm rounded hover:opacity-90 disabled:opacity-50"
            >
              <Save size={14} />
              {createMut.isPending || updateMut.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : docQuery.data ? (
        <article className="bg-white border border-gray-200 rounded-lg p-6">
          <h1 className="font-heading text-youco-blue text-2xl mb-1">
            {docQuery.data.title}
          </h1>
          <p className="text-xs text-gray-500 mb-5">
            {docQuery.data.category} • Updated{" "}
            {new Date(docQuery.data.updatedAt).toLocaleString("en-GB")}
            {docQuery.data.updatedBy ? ` by ${docQuery.data.updatedBy}` : ""}
          </p>
          <div className="markdown-body text-sm leading-relaxed text-gray-800 space-y-3">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-lg font-semibold text-gray-900 mt-5 mb-2">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-base font-semibold text-gray-900 mt-4 mb-1">{children}</h3>
                ),
                p: ({ children }) => <p className="my-2">{children}</p>,
                ul: ({ children }) => (
                  <ul className="list-disc pl-5 space-y-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-5 space-y-1">{children}</ol>
                ),
                code: ({ children }) => (
                  <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">
                    {children}
                  </code>
                ),
                pre: ({ children }) => (
                  <pre className="bg-gray-900 text-gray-100 rounded p-3 text-xs overflow-x-auto">
                    {children}
                  </pre>
                ),
                table: ({ children }) => (
                  <table className="border border-gray-200 text-xs my-3">{children}</table>
                ),
                th: ({ children }) => (
                  <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-gray-200 px-2 py-1">{children}</td>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-gray-200 pl-3 text-gray-600 italic">
                    {children}
                  </blockquote>
                ),
                a: ({ href, children }) => (
                  <a href={href} className="text-youco-blue hover:underline">
                    {children}
                  </a>
                ),
                strong: ({ children }) => (
                  <strong className="font-semibold text-gray-900">{children}</strong>
                ),
              }}
            >
              {docQuery.data.body || "*No content yet.*"}
            </ReactMarkdown>
          </div>
        </article>
      ) : null}

      {confirmDelete && docQuery.data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setConfirmDelete(false)}
          />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5">
            <h2 className="font-semibold text-gray-900 mb-2">Delete doc</h2>
            <p className="text-sm text-gray-700">
              Delete <strong>{docQuery.data.title}</strong>? This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                disabled={deleteMut.isPending}
                onClick={handleDelete}
                className="px-4 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
