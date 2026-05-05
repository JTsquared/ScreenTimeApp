#!/bin/bash
# Deploy web app to Oracle Cloud
set -e

cd "$(dirname "$0")/mobile-app"

# Use correct Node version
source ~/.nvm/nvm.sh
nvm use 20.20.2

# Build
echo "Building web app..."
npx expo export --platform web

# Inject PWA meta tags into index.html
echo "Adding PWA support..."
sed -i '' 's|<link rel="icon" href="/favicon.ico" /></head>|<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="ScreenTime"><link rel="manifest" href="/manifest.json"><link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/favicon.ico"></head>|' dist/index.html

sed -i '' 's|<div id="root"></div>|<div id="root"></div><script>if("serviceWorker" in navigator){navigator.serviceWorker.register("/sw.js");}</script>|' dist/index.html

# Deploy
echo "Deploying to server..."
OCI_KEY="/Users/jonathanturner/PersonalProjects/extras/ssh-key-2025-11-19.key"
OCI_HOST="ubuntu@141.148.79.169"

rsync -avz --delete -e "ssh -i $OCI_KEY" dist/ $OCI_HOST:~/screentime-web/

echo "Done! Web app live at http://141.148.79.169"
