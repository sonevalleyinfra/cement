import { permanentRedirect } from "next/navigation";

/** The Prism account moved to Suppliers (one account per brand). Old links land there. */
export default function OldPrismPage() {
  permanentRedirect("/suppliers");
}
