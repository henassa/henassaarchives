import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminApp } from "@/components/admin/AdminApp";
import { Header } from "@/components/Header";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default function AdminPage() {
  // L'admin n'existe qu'en local : en ligne, la page renvoie une 404.
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="page">
      <Header compact />
      <AdminApp />
    </div>
  );
}
