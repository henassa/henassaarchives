import type { MetadataRoute } from "next";
import { getAllArticles } from "@/lib/articles";
import { MINI_JEUX, SECTIONS } from "@/lib/sections";
import { SITE_URL } from "@/lib/site";

// Plan du site pour les moteurs de recherche : https://…/sitemap.xml
// Les brouillons n'y figurent pas.
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", ...Object.values(SECTIONS).map((s) => s.href), ...MINI_JEUX.filter((j) => j.pret).map((j) => `${SECTIONS.jeux.href}/${j.slug}`)];
  return [
    ...pages.map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.7 })),
    ...getAllArticles().map((a) => ({ url: `${SITE_URL}/articles/${a.slug}`, lastModified: a.date, changeFrequency: "monthly" as const, priority: 0.9 })),
  ];
}
