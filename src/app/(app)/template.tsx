/** Remounts on each top-level screen change, so every screen fades up once. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page flex flex-1 flex-col">{children}</div>;
}
