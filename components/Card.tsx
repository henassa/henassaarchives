import Link from "next/link";
import { formatDate } from "@/lib/articles";
import { Cover } from "./Cover";
import { Tag } from "./Tag";

export type CardData = {
  href: string;
  title: string;
  date: string;
  couleur: string;
  label: string;
  auteur?: string;
  cover?: string;
  coverAlt?: string;
};

export function Card({ item }: { item: CardData }) {
  return (
    <article className="card">
      <Link href={item.href} className="card__cover-link" tabIndex={-1}>
        <Cover src={item.cover} alt={item.coverAlt} couleur={item.couleur} className="card__cover" sizes="(max-width: 600px) 100vw, (max-width: 960px) 50vw, 400px" />
      </Link>
      <div className="tags">
        <Tag label={item.label} couleur={item.couleur} variant="sans" />
        {item.auteur && <span className="tag tag--sans tag--outline">Écrit par {item.auteur}</span>}
      </div>
      <h3 className="card__title">
        <Link href={item.href}>{item.title}</Link>
      </h3>
      <time className="card__date" dateTime={item.date}>
        {formatDate(item.date)}
      </time>
    </article>
  );
}
