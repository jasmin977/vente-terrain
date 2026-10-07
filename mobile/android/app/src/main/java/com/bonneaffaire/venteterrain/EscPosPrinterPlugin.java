package com.bonneaffaire.venteterrain;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

// Imprime un ticket ESC/POS en envoyant les octets bruts à l'imprimante via une
// simple socket TCP (port 9100, standard "raw"/JetDirect pris en charge par la
// plupart des imprimantes thermiques Wi-Fi, dont la SEWOO LK-P34W). Capacitor
// n'expose pas d'API de socket brute côté JS, d'où ce petit plugin natif dédié.
@CapacitorPlugin(name = "EscPosPrinter")
public class EscPosPrinterPlugin extends Plugin {

    @PluginMethod
    public void printRaw(PluginCall call) {
        String host = call.getString("host");
        Integer port = call.getInt("port", 9100);
        String base64Data = call.getString("data");

        if (host == null || host.isEmpty() || base64Data == null) {
            call.reject("host et data sont requis");
            return;
        }

        new Thread(() -> {
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(host, port), 5000);
                OutputStream out = socket.getOutputStream();
                out.write(Base64.decode(base64Data, Base64.NO_WRAP));
                out.flush();
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Échec de l'impression : " + e.getMessage(), e);
            }
        }).start();
    }
}
