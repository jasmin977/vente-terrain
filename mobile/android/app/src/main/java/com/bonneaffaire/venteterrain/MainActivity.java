package com.bonneaffaire.venteterrain;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EscPosPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
