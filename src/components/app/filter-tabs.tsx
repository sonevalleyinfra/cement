import Link from "next/link";
import { chipClass } from "./chip";

/**
 * A row of filter pills that are plain links: the picked one is in the address bar (`?param=value`),
 * so the page can be shared, bookmarked and linked from Home. Scrolls sideways inside its own row.
 * `value` "" is the default (no param in the address).
 */
export function FilterTabs({
  path,
  param,
  value,
  tabs,
  label,
}: {
  path: string;
  param: string;
  value: string;
  tabs: { value: string; label: string }[];
  label: string;
}) {
  return (
    <nav aria-label={label} className="scroll-x-fade -mx-4 flex gap-2 px-4 pb-1">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={t.value ? `${path}?${param}=${t.value}` : path}
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
