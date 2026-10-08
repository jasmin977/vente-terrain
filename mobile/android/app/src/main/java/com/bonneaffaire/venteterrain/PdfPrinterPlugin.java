package com.bonneaffaire.venteterrain;

import android.content.Context;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.util.Base64;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

// Imprime un PDF (bons A4) sur une imprimante classique via le service
// d'impression d'Android : l'écran système « Imprimer » liste les imprimantes
// Wi-Fi du réseau (Mopria, HP, Canon, Epson…) et propose aussi « Enregistrer en
// PDF ». Le WebView ne donne pas accès à ce service, d'où ce plugin natif.
@CapacitorPlugin(name = "PdfPrinter")
public class PdfPrinterPlugin extends Plugin {

    @PluginMethod
    public void print(PluginCall call) {
        String base64Data = call.getString("data");
        String name = call.getString("name", "document.pdf");
        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("data est requis");
            return;
        }

        final File file;
        try {
            file = new File(getContext().getCacheDir(), "impression.pdf");
            try (OutputStream out = new FileOutputStream(file)) {
                out.write(Base64.decode(base64Data, Base64.NO_WRAP));
            }
        } catch (Exception e) {
            call.reject("Impossible de préparer le document : " + e.getMessage());
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                PrintAttributes attributes = new PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                    .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME)
                    .build();
                printManager.print(name, new PdfDocumentAdapter(file, name), attributes);
                call.resolve();
            } catch (Exception e) {
                call.reject("Impression impossible : " + e.getMessage());
            }
        });
    }

    /** Transmet le PDF déjà mis en page au service d'impression. */
    private static class PdfDocumentAdapter extends PrintDocumentAdapter {
        private final File file;
        private final String name;

        PdfDocumentAdapter(File file, String name) {
            this.file = file;
            this.name = name;
        }

        @Override
        public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes, CancellationSignal cancellationSignal,
                             LayoutResultCallback callback, Bundle extras) {
            if (cancellationSignal.isCanceled()) {
                callback.onLayoutCancelled();
                return;
            }
            PrintDocumentInfo info = new PrintDocumentInfo.Builder(name)
                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN)
                .build();
            callback.onLayoutFinished(info, true);
        }

        @Override
        public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal cancellationSignal,
                            WriteResultCallback callback) {
            try (InputStream in = new FileInputStream(file);
                 OutputStream out = new FileOutputStream(destination.getFileDescriptor())) {
                byte[] buffer = new byte[16384];
                int n;
                while ((n = in.read(buffer)) > 0) {
                    if (cancellationSignal.isCanceled()) {
                        callback.onWriteCancelled();
                        return;
                    }
                    out.write(buffer, 0, n);
                }
                callback.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
            } catch (Exception e) {
                callback.onWriteFailed(e.getMessage());
            }
        }
    }
}
