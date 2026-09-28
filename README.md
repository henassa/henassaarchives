# Henassa

Magazine personnel en trois rubriques : **Articles**, **Connexions** et **Playlist**.
Next.js (React), sans base de données : tout est dans des fichiers.

## Lancer le site

Il faut [Node.js](https://nodejs.org) 20 ou plus.

```bash
npm install
npm run dev
```

Puis ouvre http://localhost:3000.

Pour la version de production : `npm run build` puis `npm start`.

---

## Connexions

La page `/connexions` montre des œuvres (albums, films, jeux, livres, art...) et les liens entre elles.

- **Mosaïque** : toutes les pochettes. Survoler une œuvre allume ses connexions et éteint le reste.
- **Toile** : le graphe des liens. Glisser pour se déplacer, molette ou pincement pour zoomer, glisser une œuvre pour la déplacer.
- **Fiche** : un clic ouvre l'œuvre sur le côté (en bas sur mobile), avec le lecteur YouTube (ou audio), la description et ses connexions en vignettes. « Réduire » la range en mini-lecteur en bas de l'écran : la musique continue pendant que tu explores.
- **Filtres** par type d'œuvre et **recherche** par titre, auteur, genre ou année.
- **Liens partageables** : l'adresse suit l'œuvre ouverte, par exemple `/connexions?oeuvre=54` ou `/connexions?vue=toile`.

Les données partent de zéro : ajoute tes œuvres depuis l'admin.

### L'admin

En local (`npm run dev`), va sur **http://localhost:3000/admin** :

- ajouter, modifier ou supprimer une œuvre (titre, auteur, type, année, genre, visuel, lien YouTube, description) ;
- envoyer une pochette depuis ton ordinateur : elle est copiée dans `public/images/oeuvres/` ;
- relier deux œuvres en cherchant par nom, retirer un lien.

Tout est enregistré dans `content/connexions.json`. L'admin n'existe pas en ligne : sur le site publié, `/admin` renvoie une 404 et rien ne peut être modifié.

### Le fichier de données

`content/connexions.json` peut aussi se modifier à la main :

```json
{
  "oeuvres": [
    {
      "id": 1,
      "titre": "EA Monster",
      "auteur": "Young Nudy",
      "annee": 2022,
      "type": "album",
      "genre": "Hip-Hop",
      "cover": "/images/oeuvres/ea-monster.jpg",
      "media": "https://www.youtube.com/watch?v=...",
      "description": "Facultatif."
    }
  ],
  "liens": [
    { "a": 1, "b": 2 }
  ]
}
```

Types possibles : `album`, `film`, `jeu`, `livre`, `art`, `autre`.

---

## Articles

1. Copie `content/articles/_modele.mdx`.
2. Renomme-le sans le `_` (par exemple `ok-computer.mdx`). Le nom devient l'adresse : `/articles/ok-computer`.
3. Remplis l'en-tête (titre, date, mot géant, mot gothique, catégorie, auteur, couleur...) et écris en Markdown en dessous. L'auteur s'affiche « Écrit par … » à côté de la catégorie, sur l'article et dans les listes.
4. Mets tes images dans `public/images/` et indique-les avec `/images/nom.jpg`.

L'article le plus récent est à la une de l'accueil, sauf si un autre a `une: true`.

Dans le texte :

- Markdown classique : `*italique*`, `**gras**`, `[lien](https://...)`, `## Intertitre`
- `<Citation>Une phrase forte</Citation>` : citation en grand, dans la couleur de l'article
- `<Image src="/images/x.jpg" alt="..." legende="..." />` : image avec légende

## Playlist du mois

Une seule playlist, que tu mets à jour quand tu veux : tout est dans **`content/playlist.mdx`**.

- `mois` : par exemple « Octobre 2026 », affiché sous le titre ;
- `morceaux` : la tracklist (titre, artiste, lien facultatif vers le morceau) ;
- `liens` : les liens de la playlist sur YouTube Music, Spotify, Tidal, Deezer (et Apple Music, SoundCloud si tu veux). Une ligne vide ou supprimée = pas de bouton.

La page `/playlist` affiche la tracklist, puis les boutons « Écouter sur ». L'accueil montre les 5 premiers titres.

---

## Animations

- **Écran d'arrivée** sur l'accueil, une fois par visite (un clic le passe).
- **Rideau** de la couleur de la rubrique à chaque changement de page, puis le contenu monte en fondu.
- Titres, écho gothique, cartes et pochettes apparaissent en cascade ; la fiche d'une œuvre glisse depuis le côté.
- Tout est désactivé si l'appareil demande moins d'animations (réglage d'accessibilité).

Les réglages sont à la fin de `app/globals.css`, section « Animations ».

## Couleurs

Dans `lib/sections.ts` :

| Rubrique | Couleur |
|---|---|
| Articles | `#FF4D3D` rouge |
| Connexions | `#3D7BFF` bleu |
| Playlist | `#FFC928` jaune |

| Type d'œuvre | Couleur |
|---|---|
| Album | rouge |
| Film | jaune |
| Jeu | bleu |
| Livre | vert |
| Art | rose |
| Autre | gris |

## Où est quoi

```
app/
  page.tsx                  accueil
  articles/                 liste + page d'article
  connexions/page.tsx       page Connexions
  playlist/page.tsx        playlist du mois
  admin/page.tsx            admin (local seulement)
  api/                      enregistrement de l'admin (local seulement)
  globals.css               tout le style
components/
  connexions/               mosaïque, toile, fiche, mini-lecteur
  admin/                    interface d'admin
content/
  articles/                 tes articles (.mdx)
  playlist.mdx              la playlist du mois
  connexions.json           œuvres et liens
lib/                        lecture des contenus, rubriques et couleurs
public/images/oeuvres/      pochettes
```

## Mettre en ligne

Le plus simple est [Vercel](https://vercel.com) (gratuit pour un site perso) : mets le projet sur GitHub, importe-le sur Vercel. Pour publier, tu modifies en local (articles, admin), puis tu pousses sur GitHub : Vercel met le site à jour tout seul.
