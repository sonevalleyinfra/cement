export function FormMessage({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={
        kind === "error"
          ? "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          : "rounded-md bg-muted px-3 py-2 text-sm"
      }
    >
      {children}
    </p>
  );
}
