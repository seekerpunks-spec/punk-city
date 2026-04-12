#!/usr/bin/env bash
# Déploiement Heroku — une seule app : Express sert le build Vite + Socket.io + API.
# Prérequis : Heroku CLI (https://devcenter.heroku.com/articles/heroku-cli), compte Heroku, git.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Nom d'app : variable d'environnement HEROKU_APP, sinon premier argument (ex. ./deploy.sh alpha-punk-city)
HEROKU_APP="${HEROKU_APP:-}"
if [[ -z "$HEROKU_APP" && -n "${1:-}" ]]; then
  HEROKU_APP="$1"
fi

# Par défaut : branche courante → heroku/main (évite de pousser un vieux main local)
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

if ! command -v heroku &>/dev/null; then
  echo "Installe la CLI Heroku : https://devcenter.heroku.com/articles/heroku-cli"
  exit 1
fi

# ── Première fois uniquement (décommenter / adapter) ─────────────────────
# heroku login
# heroku create "${HEROKU_APP}" --region eu
# heroku addons:create heroku-postgresql:essential-0 -a "${HEROKU_APP}"
# heroku config:set NODE_ENV=production -a "${HEROKU_APP}"

if [[ -n "$HEROKU_APP" ]]; then
  echo ">>> App Heroku : ${HEROKU_APP}"
  heroku git:remote -a "$HEROKU_APP" -r heroku
elif git remote get-url heroku &>/dev/null; then
  echo "Remote git « heroku » détecté (URL actuelle). Pour cibler une app :  $0 alpha-punk-city  ou  HEROKU_APP=alpha-punk-city $0"
else
  echo "Indique le nom de l’app Heroku, par exemple :"
  echo "  $0 alpha-punk-city"
  echo "Ou :  export HEROKU_APP=alpha-punk-city && $0"
  echo "Ou :  heroku git:remote -a alpha-punk-city"
  exit 1
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

if [[ -n "${HEROKU_APP:-}" ]]; then
  echo ">>> Ouverture du site"
  heroku open -a "$HEROKU_APP"
else
  heroku open
fi

echo ">>> Terminé. Logs : heroku logs --tail"
