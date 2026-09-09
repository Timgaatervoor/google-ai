#!/usr/bin/env sh
set -u

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "[FOUT] Node.js is niet geinstalleerd of staat niet in PATH."
  echo "Installeer eerst de LTS-versie van Node.js via https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[FOUT] npm is niet beschikbaar. Herinstalleer de LTS-versie van Node.js."
  exit 1
fi

if [ ! -f "package.json" ]; then
  echo "[FOUT] package.json ontbreekt. Pak eerst de volledige ZIP uit."
  exit 1
fi

if [ ! -f "node_modules/vite/bin/vite.js" ]; then
  echo "Eerste start: de benodigde onderdelen worden eenmalig geinstalleerd..."
  echo "Hiervoor is een internetverbinding nodig."
  npm install || exit 1
fi

echo "Tijdregistratie wordt gestart op http://localhost:3000"
echo "De lokale Stamhoofd-koppeling start automatisch mee."
echo "Laat dit venster open. Druk op Ctrl+C om te stoppen."
npm run dev -- --open
