import Link from "next/link";
import { chipClass } from "./chip";

/**
 * A row of filter pills that are plain links: the picked one is in the address bar (`?param=value`),
 * so the page can be shared, bookmarked and linked from Home. Scrolls sideways inside its own row.
 * `value` "" is the default (no param in the address). `extra` params (e.g. a search) are kept on every tab.
 */
export function FilterTabs({
  path,
  param,
  value,
  tabs,
  label,
  extra,
}: {
  path: string;
  param: string;
  value: string;
  tabs: { value: string; label: string }[];
  label: string;
  /** Other address params every tab keeps (empty values are left out). */
  extra?: Record<string, string>;
}) {
  const href = (value: string) => {
    const params = new URLSearchParams();
    if (value) params.set(param, value);
    for (const [k, v] of Object.entries(extra ?? {})) if (v) params.set(k, v);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  };
  return (
    <nav aria-label={label} className="scroll-x-fade -mx-4 flex gap-2 px-4 pb-1">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={href(t.value)}
          replace
          scroll={false}
          aria-current={t.value === value ? "page" : undefined}
          className={chipClass(t.value === value)}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
