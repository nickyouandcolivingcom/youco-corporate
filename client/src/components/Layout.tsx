import Sidebar from "./Sidebar";

interface LayoutProps {
  children: React.ReactNode;
  title: string;
}

export default function Layout({ children, title }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 bg-white border-b border-gray-200 flex items-center px-6 flex-shrink-0">
          <h2 className="font-heading text-youco-blue text-base font-semibold tracking-wide">
            {title}
          </h2>
        </header>

        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
