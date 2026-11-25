package br.com.mayrink.catalogo;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/** Abre o catálogo (assets/www) numa WebView. Links externos (WhatsApp, sites) abrem no app correspondente. */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);           // carrinho e dados do cliente ficam guardados no aparelho
        s.setAllowFileAccess(true);
        s.setSupportMultipleWindows(false);     // links "nova janela" chegam ao shouldOverrideUrlLoading
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                return abrirFora(req.getUrl());
            }
            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return abrirFora(Uri.parse(url));
            }
        });
        setContentView(web);
        if (estado != null) web.restoreState(estado);
        else web.loadUrl("file:///android_asset/www/index.html");
    }

    /** Tudo que não for o próprio catálogo abre fora do app (WhatsApp, navegador, telefone). */
    private boolean abrirFora(Uri uri) {
        if ("file".equals(uri.getScheme())) return false;
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, uri);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Nenhum aplicativo para abrir este link.", Toast.LENGTH_LONG).show();
        }
        return true;
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        web.saveState(estado);
    }

    /** Voltar: fecha a janela do produto ou o carrinho; se nenhum estiver aberto, sai do app. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript(
            "(function(){var d=[].slice.call(document.querySelectorAll('dialog[open]'));d.forEach(function(x){x.close()});return d.length>0})()",
            new ValueCallback<String>() {
                @Override public void onReceiveValue(String r) { if (!"true".equals(r)) sair(); }
            });
    }

    @SuppressWarnings("deprecation")
    private void sair() { super.onBackPressed(); }
}
