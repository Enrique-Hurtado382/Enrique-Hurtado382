package com.enriquehurtado.mototoma;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Funciones nativas de MotoToma:
 *  - guardar vídeos en la galería (Películas/MotoToma) por trozos,
 *  - voz en español (TextToSpeech),
 *  - bloquear la orientación mientras se graba,
 *  - mantener la pantalla encendida.
 */
@CapacitorPlugin(
    name = "MotoNative",
    permissions = { @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage") }
)
public class MotoNativePlugin extends Plugin {

    private static final String CARPETA = "MotoToma";

    private TextToSpeech tts;
    private boolean ttsListo = false;
    private int frase = 0;

    private static class Pendiente {
        OutputStream out;
        Uri uri;
        File file;
        String mime;
    }

    private final Map<String, Pendiente> pendientes = new HashMap<>();

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), (status) -> {
            if (status != TextToSpeech.SUCCESS) return;
            Locale elegido = null;
            Locale sistema = Locale.getDefault();
            if ("es".equals(sistema.getLanguage()) && tts.isLanguageAvailable(sistema) >= TextToSpeech.LANG_AVAILABLE) {
                elegido = sistema;
            } else {
                Locale[] opciones = { new Locale("es", "MX"), new Locale("es", "US"), new Locale("es", "ES"), new Locale("es") };
                for (Locale l : opciones) {
                    if (tts.isLanguageAvailable(l) >= TextToSpeech.LANG_AVAILABLE) {
                        elegido = l;
                        break;
                    }
                }
            }
            if (elegido != null) tts.setLanguage(elegido);
            ttsListo = true;
        });
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        for (Pendiente p : pendientes.values()) cerrar(p, true);
        pendientes.clear();
    }

    // ---------------------------------------------------------------- voz

    @PluginMethod
    public void speak(PluginCall call) {
        String texto = call.getString("text", "");
        float rate = call.getFloat("rate", 1.0f);
        boolean flush = call.getBoolean("flush", true);
        if (tts != null && ttsListo && !texto.isEmpty()) {
            tts.setSpeechRate(rate);
            Bundle params = new Bundle();
            tts.speak(texto, flush ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, params, "mototoma-" + (frase++));
        }
        call.resolve();
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }

    // ---------------------------------------------------------------- pantalla

    @PluginMethod
    public void setOrientation(PluginCall call) {
        String modo = call.getString("mode", "libre");
        int valor;
        switch (modo) {
            case "vertical":
                valor = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
                break;
            case "horizontal":
                valor = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
                break;
            case "bloquear":
                valor = ActivityInfo.SCREEN_ORIENTATION_LOCKED;
                break;
            default:
                valor = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
        }
        getActivity().runOnUiThread(() -> getActivity().setRequestedOrientation(valor));
        call.resolve();
    }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        boolean on = call.getBoolean("on", false);
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
        call.resolve();
    }

    // ---------------------------------------------------------------- guardar vídeo

    @PluginMethod
    public void saveBegin(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "permisoGuardar");
            return;
        }
        empezarGuardado(call);
    }

    @PermissionCallback
    private void permisoGuardar(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) empezarGuardado(call);
        else call.reject("Sin permiso para guardar en la galería");
    }

    private void empezarGuardado(PluginCall call) {
        String nombre = call.getString("name", "MotoToma_" + System.currentTimeMillis() + ".mp4");
        String mime = call.getString("mime", "video/mp4");
        Pendiente p = new Pendiente();
        p.mime = mime;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.Video.Media.DISPLAY_NAME, nombre);
                v.put(MediaStore.Video.Media.MIME_TYPE, mime);
                v.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/" + CARPETA);
                v.put(MediaStore.Video.Media.IS_PENDING, 1);
                p.uri = resolver.insert(MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
                if (p.uri == null) throw new IOException("No se pudo crear el archivo");
                p.out = resolver.openOutputStream(p.uri);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), CARPETA);
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("No se pudo crear la carpeta");
                p.file = new File(dir, nombre);
                p.out = new FileOutputStream(p.file);
            }
            if (p.out == null) throw new IOException("No se pudo abrir el archivo");
        } catch (Exception e) {
            cerrar(p, true);
            call.reject("No se pudo empezar a guardar: " + e.getMessage());
            return;
        }
        String id = UUID.randomUUID().toString();
        pendientes.put(id, p);
        JSObject r = new JSObject();
        r.put("id", id);
        call.resolve(r);
    }

    @PluginMethod
    public void saveAppend(PluginCall call) {
        Pendiente p = pendientes.get(call.getString("id", ""));
        if (p == null) {
            call.reject("Guardado no encontrado");
            return;
        }
        try {
            byte[] datos = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
            p.out.write(datos);
            call.resolve();
        } catch (Exception e) {
            call.reject("Error al escribir: " + e.getMessage());
        }
    }

    @PluginMethod
    public void saveFinish(PluginCall call) {
        String id = call.getString("id", "");
        Pendiente p = pendientes.remove(id);
        if (p == null) {
            call.reject("Guardado no encontrado");
            return;
        }
        try {
            p.out.flush();
            p.out.close();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.Video.Media.IS_PENDING, 0);
                getContext().getContentResolver().update(p.uri, v, null, null);
            } else if (p.file != null) {
                MediaScannerConnection.scanFile(getContext(), new String[] { p.file.getAbsolutePath() }, new String[] { p.mime }, null);
            }
            JSObject r = new JSObject();
            r.put("location", "Galería → Películas → " + CARPETA);
            r.put("uri", p.uri != null ? p.uri.toString() : (p.file != null ? p.file.getAbsolutePath() : ""));
            call.resolve(r);
        } catch (Exception e) {
            cerrar(p, true);
            call.reject("Error al terminar de guardar: " + e.getMessage());
        }
    }

    @PluginMethod
    public void saveAbort(PluginCall call) {
        Pendiente p = pendientes.remove(call.getString("id", ""));
        if (p != null) cerrar(p, true);
        call.resolve();
    }

    private void cerrar(Pendiente p, boolean borrar) {
        try {
            if (p.out != null) p.out.close();
        } catch (IOException ignored) {}
        if (!borrar) return;
        try {
            if (p.uri != null) getContext().getContentResolver().delete(p.uri, null, null);
            if (p.file != null && p.file.exists()) p.file.delete();
        } catch (Exception ignored) {}
    }

    // ---------------------------------------------------------------- galería

    @PluginMethod
    public void openGallery(PluginCall call) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, MediaStore.Video.Media.EXTERNAL_CONTENT_URI);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent i = Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_GALLERY);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
            } catch (Exception e2) {
                call.reject("No hay galería disponible");
            }
        }
    }
}
