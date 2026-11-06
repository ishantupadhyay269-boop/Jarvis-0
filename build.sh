#!/usr/bin/env bash
# One-command APK build. Run:  bash build.sh
set -e
cd "$(dirname "$0")"
echo "== 1/4 Installing packages =="
npm install
npx expo install --fix
echo "== 2/4 Installing EAS build tool =="
npm i -g eas-cli
echo "== 3/4 Login to expo.dev (enter your email + password) =="
eas whoami >/dev/null 2>&1 || eas login
eas init --non-interactive || eas init
echo "== 4/4 Building APK in the cloud (10-20 min). Answer Y to any question. =="
eas build -p android --profile preview
echo "Done. Open the .apk link above on your phone to install."
