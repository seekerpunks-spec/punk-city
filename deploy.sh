#!/usr/bin/env bash
# Déploiement Heroku — une seule app : Express sert le build Vite + Socket.io + API.
# Prérequis : Heroku CLI (https://devcenter.heroku.com/articles/heroku-cli), compte Heroku, git.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

HEROKU_APP="${HEROKU_APP:-}"
BRANCH="${BRANCH:-main}"

if ! command -v heroku &>/dev/null; then
  echo "Installe la CLI Heroku : https://devcenter.heroku.com/articles/heroku-cli"
  exit 1
fi

# ── Première fois uniquement (décommenter / adapter) ─────────────────────
# heroku login
# heroku create "${HEROKU_APP}" --region eu
# heroku addons:create heroku-postgresql:essential-0 -a "${HEROKU_APP}"
# heroku git:remote -a "${HEROKU_APP}" -r heroku
# heroku config:set NODE_ENV=production -a "${HEROKU_APP}"

if [[ -z "$HEROKU_APP" ]]; then
  if git remote get-url heroku &>/dev/null; then
    echo "Remote git « heroku » détecté — push sans option HEROKU_APP."
  else
    echo "Définis le nom de l’app :  HEROKU_APP=ma-punk-city  $0"
    echo "Ou ajoute le remote :  heroku git:remote -a ma-punk-city"
    exit 1
  fi
fi

echo ">>> Build local optionnel (vérifie que le front compile)"
npm run build

# Heroku ne déploie que le dernier commit : Procfile / package.json doivent être commités.
for f in Procfile package.json; do
  if [[ -f "$f" ]] && ! git diff --quiet HEAD -- "$f" 2>/dev/null; then
    echo ""
    echo "ERREUR: « $f » est modifié mais pas commité. Heroku ignorera ces changements."
    echo "       git add $f && git commit -m 'Heroku: Procfile / scripts' && relance ./deploy.sh"
    exit 1
  fi
done

echo ">>> Push vers Heroku (branche ${BRANCH})"
git push heroku "${BRANCH}:main"

if [[ -n "$HEROKU_APP" ]]; then
  echo ">>> Ouverture du site"
  heroku open -a "$HEROKU_APP"
else
  heroku open
fi

echo ">>> Terminé. Logs : heroku logs --tail"
