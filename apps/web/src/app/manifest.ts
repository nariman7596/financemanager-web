import type { MetadataRoute } from "next";
import { getT } from "@/lib/i18n/server";

// Makes "Add to Home Screen" a real app: its own window, and — on iOS 16.4+
// — the only way a web page may receive notifications.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getT();
  return {
    name: t("app.name"),
    short_name: t("app.name"),
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1b6ff5",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png" },
    ],
  };
}
