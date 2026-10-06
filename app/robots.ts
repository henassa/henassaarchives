import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Consignes pour les moteurs de recherche : https://…/robots.txt
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
