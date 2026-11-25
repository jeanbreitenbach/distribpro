#!/usr/bin/env bash
# Gera o APK do catálogo (app Android "Mayrink Catálogo").
#
# Uso:   ANDROID_HOME=/caminho/do/android-sdk ./android/build.sh
# Requer: JDK 17+ e, no Android SDK, "platforms;android-34" e "build-tools;35.0.0".
# Saída:  android/saida/mayrink-catalogo.apk
#
# O app leva dentro dele o catálogo (public/catalogo*, lib/catalogo.js e as fotos) e a tabela de
# preços de android/precos.json. Para atualizar preços ou produtos: edite esses arquivos, aumente
# VERSAO_CODIGO abaixo e rode o script de novo.
#
# Assinatura: usa android/assinatura.jks (criada na primeira vez, fora do Git). GUARDE ESSE ARQUIVO:
# as atualizações do app precisam ser assinadas com a mesma chave, senão o Android não instala por cima.
# Senha: variável ASSINATURA_SENHA (padrão "mayrink-catalogo").
set -euo pipefail

VERSAO_CODIGO=2
VERSAO_NOME="1.1"

AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(dirname "$AQUI")"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$SDK" ] || { echo "Defina ANDROID_HOME com o caminho do Android SDK."; exit 1; }
BT="$SDK/build-tools/35.0.0"; JAR="$SDK/platforms/android-34/android.jar"
[ -f "$JAR" ] && [ -x "$BT/aapt2" ] || { echo "Instale no SDK: platforms;android-34 e build-tools;35.0.0"; exit 1; }
SENHA="${ASSINATURA_SENHA:-mayrink-catalogo}"
KS="$AQUI/assinatura.jks"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
WWW="$TMP/assets/www"; mkdir -p "$WWW/catalogo/img"

# 1) Catálogo: mesma página do sistema, sem servidor (preços da tabela em precos.json)
cp "$RAIZ/public/catalogo/catalogo.css" "$RAIZ/public/catalogo/catalogo.js" "$WWW/"
cp "$RAIZ/lib/catalogo.js" "$WWW/catalogo-dados.js"
cp "$RAIZ/public/catalogo/img/"*.jpg "$WWW/catalogo/img/"
node -e '
  const fs = require("fs"); const [html, precos, saida] = process.argv.slice(1);
  let s = fs.readFileSync(html, "utf8");
  const fixos = JSON.stringify(JSON.parse(fs.readFileSync(precos, "utf8")));
  s = s.replace("/catalogo/catalogo.css", "catalogo.css")
       .replace(/<link rel="icon"[^>]*>\n?/, "")
       .replace(`<script src="/catalogo-dados.js"`, `<script>window.CATALOGO_SEM_API = true; window.CATALOGO_BASE = ""; window.CATALOGO_PRECOS_FIXOS = ${fixos};</script>\n<script src="catalogo-dados.js"`)
       .replace("/catalogo/catalogo.js", "catalogo.js");
  if (/(src|href)="\//.test(s)) { console.error("Ainda há caminhos absolutos no index.html"); process.exit(1); }
  fs.writeFileSync(saida, s);
' "$RAIZ/public/catalogo.html" "$AQUI/precos.json" "$WWW/index.html"

# 2) Recursos e manifesto
"$BT/aapt2" compile --dir "$AQUI/res" -o "$TMP/res.zip"
mkdir -p "$TMP/gen"
"$BT/aapt2" link -o "$TMP/base.apk" -I "$JAR" --manifest "$AQUI/AndroidManifest.xml" -A "$TMP/assets" \
  --java "$TMP/gen" --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSAO_CODIGO" --version-name "$VERSAO_NOME" "$TMP/res.zip"

# 3) Código Java → DEX
mkdir -p "$TMP/classes" "$TMP/dex"
javac -nowarn -Xlint:-options --release 8 -cp "$JAR" -d "$TMP/classes" \
  $(find "$AQUI/src" "$TMP/gen" -name '*.java')
(cd "$TMP/classes" && jar cf "$TMP/classes.jar" .)
"$BT/d8" --release --min-api 24 --lib "$JAR" --output "$TMP/dex" "$TMP/classes.jar"
(cd "$TMP/dex" && zip -q -j "$TMP/base.apk" classes.dex)

# 4) Alinhamento e assinatura
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -alias catalogo -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$SENHA" -keypass "$SENHA" -dname "CN=Mayrink Distribuidora, O=Mayrink Distribuidora, C=BR" >/dev/null 2>&1
  echo "Chave de assinatura criada em $KS (guarde-a: é necessária para atualizar o app)."
fi
mkdir -p "$AQUI/saida"
"$BT/zipalign" -f -p 4 "$TMP/base.apk" "$TMP/alinhado.apk"
"$BT/apksigner" sign --ks "$KS" --ks-key-alias catalogo --ks-pass "pass:$SENHA" --key-pass "pass:$SENHA" \
  --out "$AQUI/saida/mayrink-catalogo.apk" "$TMP/alinhado.apk"
"$BT/apksigner" verify "$AQUI/saida/mayrink-catalogo.apk"
echo "APK gerado: $AQUI/saida/mayrink-catalogo.apk ($(du -h "$AQUI/saida/mayrink-catalogo.apk" | cut -f1))"
