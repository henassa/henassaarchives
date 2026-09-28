import { NextResponse } from "next/server";
import { readConnexions, writeConnexions, type ConnexionsData } from "@/lib/oeuvres";
import { isTypeOeuvre } from "@/lib/sections";

export const dynamic = "force-dynamic";

// L'admin n'écrit dans les fichiers qu'en local (npm run dev).
function devOnly() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "L'admin ne fonctionne qu'en local (npm run dev)." }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const blocked = devOnly();
  if (blocked) return blocked;
  return NextResponse.json(readConnexions());
}

export async function PUT(request: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  const body = (await request.json()) as ConnexionsData;
  if (!Array.isArray(body?.oeuvres) || !Array.isArray(body?.liens)) {
    return NextResponse.json({ error: "Format invalide" }, { status: 400 });
  }
  for (const o of body.oeuvres) {
    if (!Number.isFinite(o.id) || !o.titre?.trim() || !o.auteur?.trim() || !isTypeOeuvre(o.type)) {
      return NextResponse.json({ error: `Œuvre invalide : ${o.titre || o.id}` }, { status: 400 });
    }
  }
  const clean: ConnexionsData = {
    oeuvres: body.oeuvres.map((o) => {
      const out: Record<string, unknown> = { id: o.id, slug: o.slug, titre: o.titre.trim(), auteur: o.auteur.trim(), type: o.type };
      if (o.annee) out.annee = Number(o.annee);
      for (const k of ["genre", "cover", "media", "description"] as const) {
        const v = o[k]?.toString().trim();
        if (v) out[k] = v;
      }
      return out as unknown as ConnexionsData["oeuvres"][number];
    }),
    liens: body.liens.map((l) => ({ a: Number(l.a), b: Number(l.b) })),
  };
  writeConnexions(clean);
  return NextResponse.json(readConnexions());
}