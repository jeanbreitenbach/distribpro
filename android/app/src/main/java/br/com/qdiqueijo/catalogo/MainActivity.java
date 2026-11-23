package br.com.qdiqueijo.catalogo;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/** Mostra o catálogo (embutido no app, funciona sem internet). Links do WhatsApp abrem o app do WhatsApp. */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return abrirFora(request.getUrl());
            }
        });
        setContentView(web);
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/catalogo/index.html");
    }

    /** Tudo que não é o próprio catálogo (wa.me, whatsapp:, sites) abre no app correspondente. */
    private boolean abrirFora(Uri uri) {
        if ("file".equals(uri.getScheme())) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Instale o WhatsApp para enviar a mensagem.", Toast.LENGTH_LONG).show();
        }
        return true;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        // Voltar fecha a janela do produto, se estiver aberta; senão sai do app.
        web.evaluateJavascript("(function(){var d=document.getElementById('janela');if(d&&d.open){d.close();return true}return false})()",
            aberto -> { if (!"true".equals(aberto)) MainActivity.super.onBackPressed(); });
    }
}
