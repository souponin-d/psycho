package ru.syncli.alarm

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SyncliAlarmModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SyncliAlarm")
    Function("canScheduleExactAlarms") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
    }
    AsyncFunction("requestExactAlarmAccess") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
          Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }
  }
}
