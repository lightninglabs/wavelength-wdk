package engineering.lightning.wavelength.reactnative

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import engineering.lightning.wavewalletdk.mobile.Mobile
import engineering.lightning.wavewalletdk.mobile.Subscription
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

// The thin JSON pipe between JS and the gomobile facade. Every facade verb
// runs on a background executor because the facade's calls block (start
// until the daemon serves, RPCs until they answer). All typing lives in
// TypeScript (see ../../../../../../src/NativeWavelength.ts).
//
// Ported from @lightninglabs/wavelength-react-native's WavelengthModule.kt,
// minus its passkey/CredentialManager methods (deliberately out of scope).
class WavelengthModule(reactContext: ReactApplicationContext) :
  NativeWavelengthSpec(reactContext) {

  private val executor: ExecutorService = Executors.newCachedThreadPool()

  override fun getName(): String = NAME

  override fun getDefaultDataDir(promise: Promise) {
    promise.resolve(File(reactApplicationContext.filesDir, "wavelength").absolutePath)
  }

  override fun call(method: String, paramsJson: String, promise: Promise) {
    executor.execute {
      try {
        promise.resolve(dispatch(method, paramsJson))
      } catch (e: Throwable) {
        promise.reject(ERROR_CODE, e.message ?: "wavelength call failed", e)
      }
    }
  }

  // Stays dumb on purpose -- all typing lives in TypeScript.
  private fun dispatch(method: String, paramsJson: String): String {
    val params = paramsJson.toByteArray(Charsets.UTF_8)
    return when (method) {
      "start" -> { Mobile.start(paramsJson); "" }
      "stop" -> { Mobile.stop(); "" }
      "getInfo" -> Mobile.getInfo().toString(Charsets.UTF_8)
      "status" -> Mobile.status().toString(Charsets.UTF_8)
      "balance" -> Mobile.balance().toString(Charsets.UTF_8)
      "createWallet" -> Mobile.createWallet(params).toString(Charsets.UTF_8)
      "unlockWallet" -> Mobile.unlockWallet(params).toString(Charsets.UTF_8)
      "startExternalSeedWallet" -> Mobile.startExternalSeedWallet(params).toString(Charsets.UTF_8)
      "deposit" -> Mobile.deposit(params).toString(Charsets.UTF_8)
      "receive" -> Mobile.receive(params).toString(Charsets.UTF_8)
      "prepareSend" -> Mobile.prepareSend(params).toString(Charsets.UTF_8)
      "sendPrepared" -> Mobile.sendPrepared(params).toString(Charsets.UTF_8)
      "list" -> Mobile.list(params).toString(Charsets.UTF_8)
      "exit" -> Mobile.exit(params).toString(Charsets.UTF_8)
      "exitStatus" -> Mobile.exitStatus(params).toString(Charsets.UTF_8)
      "exitSummary" -> Mobile.exitSummary(params).toString(Charsets.UTF_8)
      "getExitPlan" -> Mobile.getExitPlan(params).toString(Charsets.UTF_8)
      "sweepWallet" -> Mobile.sweepWallet(params).toString(Charsets.UTF_8)
      "confirmedBalanceSat" -> Mobile.confirmedBalanceSat().toString()
      "pendingInboundSat" -> Mobile.pendingInboundSat().toString()
      "walletReady" -> Mobile.walletReady().toString()
      "isRunning" -> Mobile.isRunning().toString()
      else -> throw IllegalArgumentException("unknown wavelength verb: $method")
    }
  }

  private var subscription: Subscription? = null

  // Rejects rather than silently resolving when a stream is already open;
  // resolving would tell the caller their reqJson took effect while the
  // existing subscription kept running with different options. subscribe()
  // blocks, so it runs outside the lock. Holding the lock across it would
  // leave stopActivity unable to acquire it and cancel a hung subscribe.
  override fun startActivity(reqJson: String, promise: Promise) {
    executor.execute {
      try {
        synchronized(this) {
          if (subscription != null) throw IllegalStateException(STREAM_OPEN_ERROR)
        }

        val sub = Mobile.subscribe(reqJson.toByteArray(Charsets.UTF_8))

        val started = synchronized(this) {
          if (subscription == null) {
            subscription = sub
            true
          } else {
            false
          }
        }

        if (!started) {
          // Another startActivity won the race while this one was blocked in
          // subscribe(); drop the loser rather than leaking its stream.
          sub.close()
          throw IllegalStateException(STREAM_OPEN_ERROR)
        }

        Thread({ pump(sub) }, "wavelength-activity").apply {
          isDaemon = true
          start()
        }
        promise.resolve(null)
      } catch (e: Throwable) {
        promise.reject(ERROR_CODE, e.message ?: "wavelength subscribe failed", e)
      }
    }
  }

  override fun stopActivity(promise: Promise) {
    executor.execute {
      try {
        val sub = synchronized(this) {
          val active = subscription
          // Detach before close returns so a queued start can't reuse a pump
          // that's already stopping.
          subscription = null
          active
        }
        sub?.close()
        promise.resolve(null)
      } catch (e: Throwable) {
        promise.reject(ERROR_CODE, e.message ?: "wavelength unsubscribe failed", e)
      }
    }
  }

  // Runs on its own daemon thread because next() blocks.
  private fun pump(sub: Subscription) {
    try {
      while (true) {
        val entry = try {
          sub.next()
        } catch (e: Exception) {
          // Only the exact terminal "EOF" is a clean close; a substring match
          // would misclassify real failures like "unexpected EOF" as clean
          // ends and silently freeze the stream.
          val stopped = synchronized(this) { subscription !== sub }
          // An intentional stop has no terminal event. A replacement may
          // already be open by the time this old pump unblocks.
          if (stopped) {
            break
          }
          if (e.message == "EOF") {
            sendEvent("end", "")
          } else {
            sendEvent("error", e.message ?: "wavelength activity stream failed")
          }
          break
        }
        if (synchronized(this) { subscription !== sub }) {
          break
        }
        sendEvent("entry", entry.toString(Charsets.UTF_8))
      }
    } catch (t: Throwable) {
      // Emitting can fail while React tears down (a reload mid-stream);
      // there is nobody left to notify, but this daemon thread must never
      // crash the process.
    } finally {
      try {
        sub.close()
      } catch (ignored: Exception) {
        // The subscription may already be closed; nothing further to do.
      }
      synchronized(this) {
        if (subscription === sub) {
          subscription = null
        }
      }
    }
  }

  private fun sendEvent(kind: String, payload: String) {
    val body = Arguments.createMap().apply {
      putString("kind", kind)
      putString("payload", payload)
    }
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("wavelengthActivity", body)
  }

  // Without this, a JS reload constructs a second module while this one's
  // executor threads and activity pump keep running against the same
  // process-wide Mobile facade. Threads already blocked inside a native
  // call cannot be interrupted, so shutdownNow() only stops queued work,
  // but it does prevent new work and closing the subscription ends the pump.
  override fun invalidate() {
    val sub = synchronized(this) {
      val active = subscription
      subscription = null
      active
    }
    try {
      sub?.close()
    } catch (ignored: Exception) {
      // Already closed, or the stream died with the daemon; nothing to do.
    }
    executor.shutdownNow()
    super.invalidate()
  }

  override fun addListener(eventName: String) = Unit

  override fun removeListeners(count: Double) = Unit

  companion object {
    const val NAME = "Wavelength"
    const val ERROR_CODE = "wavelength_error"
    const val STREAM_OPEN_ERROR = "activity stream already open; call stopActivity first"
  }
}
