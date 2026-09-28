import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);

function slugify(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image"
  );
}

// Envoi d'une image vers public/images/oeuvres (en local uniquement).
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disponible seulement en local." }, { status: 403 });
  }
  const form = await request.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier" }, { status: 400 });
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED.has(ext)) return NextResponse.json({ error: "Format d'image non pris en charge" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Image trop lourde (8 Mo max)" }, { status: 400 });

  const dir = path.join(process.cwd(), "public", "images", "oeuvres");
  fs.mkdirSync(dir, { recursive: true });
  let base = slugify(name || file.name.replace(/\.[^.]+$/, ""));
  let fileName = `${base}.${ext}`;
  let i = 2;
  while (fs.existsSync(path.join(dir, fileName))) fileName = `${base}-${i++}.${ext}`;
  fs.writeFileSync(path.join(dir, fileName), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ path: `/images/oeuvres/${fileName}` });
}
