# Deployment Handleiding via Git

Dit project is geoptimaliseerd voor automatische deployment via Git. Zodra je de broncode naar een Git-repository (zoals GitHub, GitLab, Vercel of Netlify) pusht, kan het project automatisch bouwen en online worden gezet als Progressive Web App (PWA).

---

## 1. Deployen via GitHub Pages (Aanbevolen)

Er is een geautomatiseerde GitHub Actions workflow geconfigureerd in `.github/workflows/deploy.yml`.

### Stappen:
1. **Initialiseer en commit je lokale code:**
   ```bash
   git add .
   git commit -m "Initial commit voor biathlon tijdregistratie"
   ```

2. **Koppel je GitHub repository en push:**
   ```bash
   git remote add origin https://github.com/<jouw-gebruikersnaam>/<jouw-repository-naam>.git
   git branch -M main
   git push -u origin main
   ```

3. **Activeer GitHub Pages in je repository instellingen:**
   - Ga op GitHub naar je repository.
   - Klik op **Settings** > **Pages** (in het linkermenu).
   - Kies onder **Build and deployment** > **Source** voor: **GitHub Actions**.

4. **Klaar!**
   - Bij elke `git push` naar de `main` branch draait GitHub Actions automatisch de tests, de linter en de productiebuild.
   - De app wordt gepubliceerd op `https://<jouw-gebruikersnaam>.github.io/<jouw-repository-naam>/`.
   - Dankzij de ingebouwde instelling in `vite.config.ts` wordt het subpad van je repository automatisch herkend en correct geconfigureerd voor de PWA.

---

## 2. Deployen via Vercel

Dankzij het meegeleverde bestand `vercel.json` werkt deployment via Vercel out-of-the-box met Git:

1. Koppel je GitHub/GitLab account op [Vercel](https://vercel.com).
2. Klik op **Add New Project** en selecteer je repository.
3. Vercel herkent Vite automatisch.
4. Klik op **Deploy**.
5. Elke volgende `git push` naar `main` deployt automatisch een nieuwe versie.

---

## 3. Deployen via Netlify

Het configuratiebestand `netlify.toml` zorgt ervoor dat Netlify de SPA en routering direct goed instelt:

1. Ga naar [Netlify](https://www.netlify.com) en kies **Import from Git**.
2. Selecteer de repository.
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Klik op **Deploy site**.

---

## 4. Deployen via Docker / Cloud Run / Container Platforms

Het project bevat een geoptimaliseerde multi-stage `Dockerfile` en `.dockerignore`:

```bash
# Lokaal bouwen en testen:
docker build -t biathlon-app .
docker run -p 3000:3000 biathlon-app
```

Dit kan direct worden gekoppeld aan platforms zoals Google Cloud Run, Railway, Render of Coolify via Git-gebaseerde triggers.

---

## 5. Offline & PWA Werking na Deployment

- Na de eerste keer laden in de browser installeert de Service Worker alle benodigde bestanden lokaal (`workbox`).
- De app blijft daardoor 100% functioneel zonder internetverbinding op de wedstrijdlocatie (startpost, schietstand, finishlijn).
