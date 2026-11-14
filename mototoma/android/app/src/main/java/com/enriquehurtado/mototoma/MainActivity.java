package com.enriquehurtado.mototoma;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // El plugin propio se registra antes de crear el puente.
        registerPlugin(MotoNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
