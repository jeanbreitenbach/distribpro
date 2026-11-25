#!/usr/bin/env bash
# Monta o RepCRM.apk sem Gradle (só Android SDK: aapt2, javac, d8, zipalign, apksigner).
# Uso: ANDROID_HOME=/caminho/do/sdk ./build.sh   (gera RepCRM.apk nesta pasta)
# A chave de assinatura fica em ~/.repcrm/repcrm.keystore; para atualizar o app sem desinstalar, use sempre a mesma chave.
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_HOME:?defina ANDROID_HOME com o caminho do Android SDK}"
BT="$ANDROID_HOME/build-tools/34.0.0"; JAR="$ANDROID_HOME/platforms/android-34/android.jar"
OUT=$(mktemp -d); trap 'rm -rf "$OUT"' EXIT
"$BT/aapt2" compile --dir res -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$JAR" --manifest AndroidManifest.xml --min-sdk-version 24 --target-sdk-version 34 "$OUT/res.zip"
mkdir -p "$OUT/classes" "$OUT/dex"
javac -nowarn --release 11 -cp "$JAR" -d "$OUT/classes" $(find src -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
cp "$OUT/base.apk" "$OUT/semdex.apk"; (cd "$OUT/dex" && zip -q -j "$OUT/semdex.apk" classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/semdex.apk" "$OUT/alinhado.apk"
KS="${REPCRM_KEYSTORE:-$HOME/.repcrm/repcrm.keystore}"; SENHA="${REPCRM_KEYSTORE_SENHA:-repcrm-app}"
if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -keystore "$KS" -storepass "$SENHA" -keypass "$SENHA" -alias repcrm -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=RepCRM, O=RepCRM, C=BR" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass "pass:$SENHA" --ks-key-alias repcrm --out RepCRM.apk "$OUT/alinhado.apk"
rm -f RepCRM.apk.idsig
"$BT/apksigner" verify RepCRM.apk && echo "Pronto: $(pwd)/RepCRM.apk ($(du -k RepCRM.apk | cut -f1) KB)"
