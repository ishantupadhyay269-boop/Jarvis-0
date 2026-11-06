package expo.modules.jarvisnative

import java.util.concurrent.atomic.AtomicBoolean

/** Tiny in-process bridge between the foreground service and the JS module (same process). */
object WakeBus {
  @Volatile var running = false

  /** JS sets this while it uses the microphone itself (only one recognizer can hold the mic). */
  val paused = AtomicBoolean(false)

  /** Service registers this so JS can make it release the microphone immediately. */
  @Volatile var onPause: (() -> Unit)? = null

  /** JS module registers this to receive wake events while the React runtime is alive. */
  @Volatile var listener: ((String) -> Unit)? = null
}
