import { ScreenFade } from "@/components/app/screen-fade";

/** Remounts on each top-level screen change, so every screen fades up once. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <ScreenFade>{children}</ScreenFade>;
}
