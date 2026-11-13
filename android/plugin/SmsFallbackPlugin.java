// Capacitor plugin for the TRISHUL Android app. NOT compiled or run in the build environment: needs Android Studio and a real phone.
// It hands an SMS to the phone's SmsManager. It cannot know whether the message was delivered, so the app never says "delivered".
package com.trishul.app;

import android.Manifest;
import android.telephony.SmsManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;
import java.util.ArrayList;

@CapacitorPlugin(name = "SmsFallback", permissions = { @Permission(strings = { Manifest.permission.SEND_SMS }, alias = "sms") })
public class SmsFallbackPlugin extends Plugin {
  @PluginMethod public void checkPermission(PluginCall call) { JSObject r = new JSObject(); r.put("granted", getPermissionState("sms") == PermissionState.GRANTED); call.resolve(r); }
  @PluginMethod public void requestPermission(PluginCall call) { if (getPermissionState("sms") == PermissionState.GRANTED) { checkPermission(call); return; } requestPermissionForAlias("sms", call, "afterPermission"); }
  @PermissionCallback private void afterPermission(PluginCall call) { checkPermission(call); }

  @PluginMethod public void send(PluginCall call) {
    String to = call.getString("to"), body = call.getString("body");
    if (to == null || body == null || getPermissionState("sms") != PermissionState.GRANTED) { call.reject("NO_PERMISSION_OR_ARGS"); return; }
    try {
      SmsManager sm = getContext().getSystemService(SmsManager.class);
      ArrayList<String> parts = sm.divideMessage(body); sm.sendMultipartTextMessage(to, null, parts, null, null);
      JSObject r = new JSObject(); r.put("handedToPhone", true); call.resolve(r);   // handed over, NOT delivered
    } catch (Exception e) { JSObject r = new JSObject(); r.put("handedToPhone", false); call.resolve(r); }
  }
}
