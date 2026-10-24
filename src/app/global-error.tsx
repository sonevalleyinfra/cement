"use client";

/**
 * Last resort when even the root layout fails. It renders its own page (no app styles load here),
 * so it uses plain inline styles. Never shows the error details.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 16,
          fontFamily: "system-ui, sans-serif",
          background: "oklch(0.978 0.007 75)", // --background
          color: "oklch(0.21 0.02 50)", // --foreground
          textAlign: "center",
        }}
      >
        <title>Couldn&apos;t load</title>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Couldn&apos;t load. Check your network.</p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            minHeight: 48,
            minWidth: 160,
            padding: "0 16px",
            borderRadius: 12,
            border: 0,
            background: "oklch(0.6 0.19 42)", // --primary
            color: "oklch(0.99 0.005 75)", // --primary-foreground
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          Retry
        </button>
      </body>
    </html>
  );
}
