import { ReactNode } from "react";

interface MainContentProps {
  children: ReactNode;
}

export function MainContent({ children }: MainContentProps) {
  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}