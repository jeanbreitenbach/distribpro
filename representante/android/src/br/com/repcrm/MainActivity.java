package br.com.repcrm;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;

/**
 * Abre o RepCRM (página na conta Claude) numa "aba personalizada" do navegador:
 * tela cheia, com a cor do app e usando o login do Claude que já está no Chrome.
 * Ao voltar (botão Voltar), o app fecha.
 */
public class MainActivity extends Activity {
    static final String ENDERECO = "https://claude.ai/artifact/WAUmo4P1S5pNbELUotW9Bt";
    static final int COR = 0xFF0F766E;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        if (estado == null) abrir();
    }

    /** Voltou da aba (o usuário apertou Voltar): fecha o app. */
    @Override
    protected void onRestart() {
        super.onRestart();
        finish();
    }

    private void abrir() {
        Uri uri = Uri.parse(ENDERECO);
        Intent aba = new Intent(Intent.ACTION_VIEW, uri);
        Bundle extras = new Bundle();
        extras.putBinder("android.support.customtabs.extra.SESSION", null); // pede aba personalizada
        aba.putExtras(extras);
        aba.putExtra("android.support.customtabs.extra.TOOLBAR_COLOR", COR);
        aba.putExtra("android.support.customtabs.extra.TITLE_VISIBILITY", 1);
        aba.putExtra("androidx.browser.customtabs.extra.SHARE_STATE", 2); // sem botão de compartilhar
        String navegador = navegadorComAbas();
        if (navegador != null) aba.setPackage(navegador);
        try {
            startActivity(aba);
        } catch (ActivityNotFoundException e) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException semNavegador) {
                finish();
            }
        }
    }

    /** Prefere o Chrome (onde o login do Claude costuma estar); senão, outro navegador que suporte abas. */
    private String navegadorComAbas() {
        PackageManager pm = getPackageManager();
        String[] preferidos = {"com.android.chrome", "com.chrome.beta", "com.sec.android.app.sbrowser", "com.microsoft.emmx", "com.brave.browser", "org.mozilla.firefox"};
        Intent servico = new Intent("android.support.customtabs.action.CustomTabsService");
        for (String p : preferidos) {
            servico.setPackage(p);
            if (pm.resolveService(servico, 0) != null) return p;
        }
        return null;
    }
}
