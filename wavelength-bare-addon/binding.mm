// Every export returns a Promise. The Go calls block (startExternalSeedWallet
// and payments can take a long time), so they run on a GCD queue and settle
// back on the worklet's loop via a per-call uv_async_t. GCD rather than the
// libuv threadpool because a pending Subscription.next would otherwise pin
// one of its few threads, which bare-fs and friends share.
//
// The file is compiled without ARC, so Objective-C objects never cross back to
// the loop thread: results are copied into malloc'd buffers on the worker.

#include <assert.h>
#include <bare.h>
#include <dispatch/dispatch.h>
#include <js.h>
#include <pthread.h>
#include <stdlib.h>
#include <string.h>
#include <uv.h>

#import <Foundation/Foundation.h>
#import <Wavewalletdk.h>

typedef enum {
  wavelength_result_undefined,
  wavelength_result_null,
  wavelength_result_string,
  wavelength_result_boolean,
  wavelength_result_subscription,
} wavelength_result_type_t;

typedef struct wavelength_env_s wavelength_env_t;
typedef struct wavelength_call_s wavelength_call_t;
typedef struct wavelength_subscription_s wavelength_subscription_t;

typedef void (*wavelength_work_cb)(wavelength_call_t *call);

// Per-worklet state, so a worklet that is torn down mid-call (Retry, reload)
// can detach its in-flight calls and close its streams instead of leaving a
// Go thread to signal a handle on a loop that no longer exists.
struct wavelength_env_s {
  js_env_t *env;
  wavelength_call_t *calls;
  wavelength_subscription_t *subscriptions;
  js_deferred_teardown_t *teardown;
  size_t closing;
};

struct wavelength_call_s {
  uv_async_t async;
  wavelength_env_t *state;
  js_deferred_t *deferred;
  wavelength_call_t *prev;
  wavelength_call_t *next;

  wavelength_work_cb work;
  void *fn;

  char *req;
  size_t req_len;
  bool has_req;

  // Retained for as long as the call is in flight. For subscribe it is the
  // result, handed over to the JS external on completion.
  MobileSubscription *subscription;

  wavelength_result_type_t type;
  char *out;
  size_t out_len;
  bool boolean;
  char *error;

  // Guarded by wavelength_lock: the worker and a teardown race to decide who
  // frees an orphaned call.
  bool orphaned;
  bool worker_done;
  bool handle_closed;
};

// Owned by the JS external. `state` is NULL once teardown has detached it.
struct wavelength_subscription_s {
  MobileSubscription *subscription;
  wavelength_env_t *state;
  wavelength_subscription_t *prev;
  wavelength_subscription_t *next;
};

static pthread_mutex_t wavelength_lock = PTHREAD_MUTEX_INITIALIZER;

#define WAVELENGTH_LIST_PUSH(head, node) \
  do { \
    (node)->prev = NULL; \
    (node)->next = (head); \
    if ((head) != NULL) (head)->prev = (node); \
    (head) = (node); \
  } while (0)

#define WAVELENGTH_LIST_REMOVE(head, node) \
  do { \
    if ((node)->prev != NULL) (node)->prev->next = (node)->next; \
    else (head) = (node)->next; \
    if ((node)->next != NULL) (node)->next->prev = (node)->prev; \
    (node)->prev = (node)->next = NULL; \
  } while (0)

static dispatch_queue_t
wavelength_queue(void) {
  return dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0);
}

static void
wavelength_set_data(wavelength_call_t *call, NSData *data) {
  if (data == nil) {
    call->type = wavelength_result_null;
    return;
  }

  call->type = wavelength_result_string;
  call->out_len = data.length;
  call->out = (char *) malloc(data.length > 0 ? data.length : 1);
  memcpy(call->out, data.bytes, data.length);
}

static void
wavelength_set_string(wavelength_call_t *call, const char *str) {
  call->type = wavelength_result_string;
  call->out_len = strlen(str);
  call->out = strdup(str);
}

static void
wavelength_set_boolean(wavelength_call_t *call, BOOL value) {
  call->type = wavelength_result_boolean;
  call->boolean = value;
}

static bool
wavelength_set_error(wavelength_call_t *call, NSError *error) {
  if (error == nil) return false;

  const char *message = error.localizedDescription.UTF8String;
  call->error = strdup(message ? message : "wavelength_error");
  return true;
}

static NSData *
wavelength_req_data(wavelength_call_t *call) {
  if (!call->has_req) return nil;
  return [NSData dataWithBytes:call->req length:call->req_len];
}

static void
wavelength_call_free(wavelength_call_t *call) {
  [call->subscription release];
  free(call->req);
  free(call->out);
  free(call->error);
  free(call);
}

static void
wavelength_on_close(uv_handle_t *handle) {
  wavelength_call_free((wavelength_call_t *) handle->data);
}

static void
wavelength_subscription_close(void *data) {
  MobileSubscription *subscription = (MobileSubscription *) data;

  @autoreleasepool {
    [subscription close:nil];
  }

  [subscription release];
}

// Closing unblocks any next() still waiting on the dropped handle, which would
// otherwise hold a goroutine until the daemon stops.
static void
wavelength_subscription_finalize(js_env_t *env, void *data, void *finalize_hint) {
  wavelength_subscription_t *wrapper = (wavelength_subscription_t *) data;

  if (wrapper->state != NULL) {
    WAVELENGTH_LIST_REMOVE(wrapper->state->subscriptions, wrapper);
  }

  dispatch_async_f(wavelength_queue(), wrapper->subscription, wavelength_subscription_close);
  free(wrapper);
}

static js_value_t *
wavelength_subscription_to_js(wavelength_call_t *call) {
  int err;

  wavelength_subscription_t *wrapper = (wavelength_subscription_t *) calloc(1, sizeof(wavelength_subscription_t));
  wrapper->subscription = call->subscription;
  wrapper->state = call->state;
  call->subscription = nil;

  WAVELENGTH_LIST_PUSH(call->state->subscriptions, wrapper);

  js_value_t *value;
  err = js_create_external(call->state->env, wrapper, wavelength_subscription_finalize, NULL, &value);
  assert(err == 0);
  return value;
}

static void
wavelength_on_complete(uv_async_t *handle) {
  int err;

  wavelength_call_t *call = (wavelength_call_t *) handle->data;
  js_env_t *env = call->state->env;

  WAVELENGTH_LIST_REMOVE(call->state->calls, call);

  js_handle_scope_t *scope;
  err = js_open_handle_scope(env, &scope);
  assert(err == 0);

  js_value_t *value;

  if (call->error != NULL) {
    js_value_t *message;
    err = js_create_string_utf8(env, (const utf8_t *) call->error, strlen(call->error), &message);
    assert(err == 0);

    err = js_create_error(env, NULL, message, &value);
    assert(err == 0);

    err = js_reject_deferred(env, call->deferred, value);
    assert(err == 0);
  } else {
    switch (call->type) {
    case wavelength_result_undefined:
      err = js_get_undefined(env, &value);
      break;
    case wavelength_result_null:
      err = js_get_null(env, &value);
      break;
    case wavelength_result_string:
      err = js_create_string_utf8(env, (const utf8_t *) call->out, call->out_len, &value);
      break;
    case wavelength_result_boolean:
      err = js_get_boolean(env, call->boolean, &value);
      break;
    case wavelength_result_subscription:
      value = wavelength_subscription_to_js(call);
      err = 0;
      break;
    }
    assert(err == 0);

    err = js_resolve_deferred(env, call->deferred, value);
    assert(err == 0);
  }

  err = js_close_handle_scope(env, scope);
  assert(err == 0);

  uv_close((uv_handle_t *) handle, wavelength_on_close);
}

static void
wavelength_run(void *data) {
  wavelength_call_t *call = (wavelength_call_t *) data;

  @autoreleasepool {
    call->work(call);
  }

  bool free_now = false;

  pthread_mutex_lock(&wavelength_lock);
  call->worker_done = true;
  if (call->orphaned) {
    free_now = call->handle_closed;
  } else {
    uv_async_send(&call->async);
  }
  pthread_mutex_unlock(&wavelength_lock);

  if (free_now) wavelength_call_free(call);
}

static void
wavelength_teardown_finish(wavelength_env_t *state) {
  js_finish_deferred_teardown_callback(state->teardown);
  free(state);
}

static void
wavelength_on_orphan_close(uv_handle_t *handle) {
  wavelength_call_t *call = (wavelength_call_t *) handle->data;
  wavelength_env_t *state = call->state;

  bool free_now;

  pthread_mutex_lock(&wavelength_lock);
  call->handle_closed = true;
  free_now = call->worker_done;
  pthread_mutex_unlock(&wavelength_lock);

  if (free_now) wavelength_call_free(call);

  if (--state->closing == 0) wavelength_teardown_finish(state);
}

// Deferred so the loop keeps running until every orphaned handle has closed.
// Calls still running in Go are left to finish on their own and free
// themselves; their promises are never settled, as there is no JS left.
static void
wavelength_teardown(js_deferred_teardown_t *handle, void *data) {
  wavelength_env_t *state = (wavelength_env_t *) data;

  while (state->subscriptions != NULL) {
    wavelength_subscription_t *wrapper = state->subscriptions;
    WAVELENGTH_LIST_REMOVE(state->subscriptions, wrapper);
    wrapper->state = NULL;

    dispatch_async_f(wavelength_queue(), [wrapper->subscription retain], wavelength_subscription_close);
  }

  if (state->calls == NULL) {
    wavelength_teardown_finish(state);
    return;
  }

  while (state->calls != NULL) {
    wavelength_call_t *call = state->calls;
    WAVELENGTH_LIST_REMOVE(state->calls, call);

    pthread_mutex_lock(&wavelength_lock);
    call->orphaned = true;
    pthread_mutex_unlock(&wavelength_lock);

    state->closing++;
    uv_close((uv_handle_t *) &call->async, wavelength_on_orphan_close);
  }
}

static wavelength_call_t *
wavelength_call_create(js_env_t *env, js_callback_info_t *info, wavelength_work_cb work, void *fn, size_t *argc, js_value_t **argv) {
  int err;

  void *data;
  err = js_get_callback_info(env, info, argc, argv, NULL, &data);
  assert(err == 0);

  wavelength_call_t *call = (wavelength_call_t *) calloc(1, sizeof(wavelength_call_t));
  call->state = (wavelength_env_t *) data;
  call->work = work;
  call->fn = fn;
  return call;
}

static void
wavelength_call_read_req(js_env_t *env, wavelength_call_t *call, js_value_t *value) {
  int err;

  size_t len;
  err = js_get_value_string_utf8(env, value, NULL, 0, &len);
  assert(err == 0);

  call->req = (char *) malloc(len + 1);
  call->req_len = len;
  call->has_req = true;

  err = js_get_value_string_utf8(env, value, (utf8_t *) call->req, len + 1, NULL);
  assert(err == 0);
}

static js_value_t *
wavelength_call_dispatch(js_env_t *env, wavelength_call_t *call, bool keeps_alive) {
  int err;

  js_value_t *promise;
  err = js_create_promise(env, &call->deferred, &promise);
  assert(err == 0);

  uv_loop_t *loop;
  err = js_get_env_loop(env, &loop);
  assert(err == 0);

  err = uv_async_init(loop, &call->async, wavelength_on_complete);
  assert(err == 0);

  call->async.data = call;

  if (!keeps_alive) uv_unref((uv_handle_t *) &call->async);

  WAVELENGTH_LIST_PUSH(call->state->calls, call);

  dispatch_async_f(wavelength_queue(), call, wavelength_run);

  return promise;
}

// Reads the optional request string and queues `work`.
static js_value_t *
wavelength_queue_call(js_env_t *env, js_callback_info_t *info, wavelength_work_cb work, void *fn) {
  size_t argc = 1;
  js_value_t *argv[1];

  wavelength_call_t *call = wavelength_call_create(env, info, work, fn, &argc, argv);

  if (argc >= 1) wavelength_call_read_req(env, call, argv[0]);

  return wavelength_call_dispatch(env, call, true);
}

typedef NSData *_Nullable (*wavelength_json_fn_t)(NSData *_Nullable reqJSON, NSError *_Nullable *_Nullable error);

static void
wavelength_work_json(wavelength_call_t *call) {
  NSError *error = nil;
  NSData *result = ((wavelength_json_fn_t) call->fn)(wavelength_req_data(call), &error);

  if (wavelength_set_error(call, error)) return;

  wavelength_set_data(call, result);
}

// Assigning to the typed pointer before the void * cast makes a Mobile*
// signature that no longer matches fail to compile instead of being called
// with the wrong arguments at runtime.
#define WAVELENGTH_JSON_METHOD(name, mobile_fn) \
  static js_value_t * \
  wavelength_##name(js_env_t *env, js_callback_info_t *info) { \
    wavelength_json_fn_t fn = mobile_fn; \
    return wavelength_queue_call(env, info, wavelength_work_json, (void *) fn); \
  }

WAVELENGTH_JSON_METHOD(startExternalSeedWallet, MobileStartExternalSeedWallet)
WAVELENGTH_JSON_METHOD(createWallet, MobileCreateWallet)
WAVELENGTH_JSON_METHOD(unlockWallet, MobileUnlockWallet)
WAVELENGTH_JSON_METHOD(openWalletFromPasskey, MobileOpenWalletFromPasskey)
WAVELENGTH_JSON_METHOD(deposit, MobileDeposit)
WAVELENGTH_JSON_METHOD(receive, MobileReceive)
WAVELENGTH_JSON_METHOD(prepareSend, MobilePrepareSend)
WAVELENGTH_JSON_METHOD(sendPrepared, MobileSendPrepared)
WAVELENGTH_JSON_METHOD(list, MobileList)
WAVELENGTH_JSON_METHOD(exit, MobileExit)
WAVELENGTH_JSON_METHOD(exitStatus, MobileExitStatus)
WAVELENGTH_JSON_METHOD(exitSummary, MobileExitSummary)
WAVELENGTH_JSON_METHOD(getExitPlan, MobileGetExitPlan)
WAVELENGTH_JSON_METHOD(sweepWallet, MobileSweepWallet)

#undef WAVELENGTH_JSON_METHOD

static void
wavelength_work_start(wavelength_call_t *call) {
  NSString *cfg = [[[NSString alloc] initWithBytes:call->req
                                            length:call->req_len
                                          encoding:NSUTF8StringEncoding] autorelease];

  NSError *error = nil;
  BOOL ok = MobileStart(cfg, &error);

  if (wavelength_set_error(call, error)) return;

  wavelength_set_boolean(call, ok);
}

static js_value_t *
wavelength_start(js_env_t *env, js_callback_info_t *info) {
  size_t argc = 1;
  js_value_t *argv[1];

  wavelength_call_t *call = wavelength_call_create(env, info, wavelength_work_start, NULL, &argc, argv);

  if (argc < 1) {
    wavelength_call_free(call);
    js_throw_error(env, NULL, "start requires a config");
    return NULL;
  }

  wavelength_call_read_req(env, call, argv[0]);

  return wavelength_call_dispatch(env, call, true);
}

static void
wavelength_work_stop(wavelength_call_t *call) {
  NSError *error = nil;
  BOOL ok = MobileStop(&error);

  if (wavelength_set_error(call, error)) return;

  wavelength_set_boolean(call, ok);
}

static js_value_t *
wavelength_stop(js_env_t *env, js_callback_info_t *info) {
  return wavelength_queue_call(env, info, wavelength_work_stop, NULL);
}

typedef NSData *_Nullable (*wavelength_getter_fn_t)(NSError *_Nullable *_Nullable error);

static void
wavelength_work_getter(wavelength_call_t *call) {
  NSError *error = nil;
  NSData *result = ((wavelength_getter_fn_t) call->fn)(&error);

  if (wavelength_set_error(call, error)) return;

  wavelength_set_data(call, result);
}

#define WAVELENGTH_GETTER_METHOD(name, mobile_fn) \
  static js_value_t * \
  wavelength_##name(js_env_t *env, js_callback_info_t *info) { \
    wavelength_getter_fn_t fn = mobile_fn; \
    return wavelength_queue_call(env, info, wavelength_work_getter, (void *) fn); \
  }

WAVELENGTH_GETTER_METHOD(getInfo, MobileGetInfo)
WAVELENGTH_GETTER_METHOD(status, MobileStatus)
WAVELENGTH_GETTER_METHOD(balance, MobileBalance)

#undef WAVELENGTH_GETTER_METHOD

typedef BOOL (*wavelength_sat_fn_t)(int64_t *_Nullable ret, NSError *_Nullable *_Nullable error);

// Returned as a decimal string so values past 2^53 survive the trip to JS.
static void
wavelength_work_sat(wavelength_call_t *call) {
  int64_t value = 0;
  NSError *error = nil;
  ((wavelength_sat_fn_t) call->fn)(&value, &error);

  if (wavelength_set_error(call, error)) return;

  char buf[32];
  snprintf(buf, sizeof(buf), "%lld", (long long) value);
  wavelength_set_string(call, buf);
}

static js_value_t *
wavelength_confirmedBalanceSat(js_env_t *env, js_callback_info_t *info) {
  wavelength_sat_fn_t fn = MobileConfirmedBalanceSat;
  return wavelength_queue_call(env, info, wavelength_work_sat, (void *) fn);
}

static js_value_t *
wavelength_pendingInboundSat(js_env_t *env, js_callback_info_t *info) {
  wavelength_sat_fn_t fn = MobilePendingInboundSat;
  return wavelength_queue_call(env, info, wavelength_work_sat, (void *) fn);
}

static void
wavelength_work_walletReady(wavelength_call_t *call) {
  BOOL value = NO;
  NSError *error = nil;
  MobileWalletReady(&value, &error);

  if (wavelength_set_error(call, error)) return;

  wavelength_set_boolean(call, value);
}

static js_value_t *
wavelength_walletReady(js_env_t *env, js_callback_info_t *info) {
  return wavelength_queue_call(env, info, wavelength_work_walletReady, NULL);
}

static void
wavelength_work_isRunning(wavelength_call_t *call) {
  wavelength_set_boolean(call, MobileIsRunning());
}

static js_value_t *
wavelength_isRunning(js_env_t *env, js_callback_info_t *info) {
  return wavelength_queue_call(env, info, wavelength_work_isRunning, NULL);
}

static void
wavelength_work_subscribe(wavelength_call_t *call) {
  NSError *error = nil;
  MobileSubscription *subscription = MobileSubscribe(wavelength_req_data(call), &error);

  if (wavelength_set_error(call, error)) return;

  call->type = wavelength_result_subscription;
  call->subscription = [subscription retain];
}

static js_value_t *
wavelength_subscribe(js_env_t *env, js_callback_info_t *info) {
  return wavelength_queue_call(env, info, wavelength_work_subscribe, NULL);
}

// Next reports a clean end as io.EOF; resolve that as null so only real
// failures reject. An exact match keeps "unexpected EOF" a failure.
static void
wavelength_work_subscriptionNext(wavelength_call_t *call) {
  NSError *error = nil;
  NSData *result = [call->subscription next:&error];

  if (error != nil && [error.localizedDescription isEqualToString:@"EOF"]) {
    call->type = wavelength_result_null;
    return;
  }

  if (wavelength_set_error(call, error)) return;

  wavelength_set_data(call, result);
}

static void
wavelength_work_subscriptionClose(wavelength_call_t *call) {
  NSError *error = nil;
  [call->subscription close:&error];

  wavelength_set_error(call, error);
}

static js_value_t *
wavelength_queue_subscription_call(js_env_t *env, js_callback_info_t *info, wavelength_work_cb work, bool keeps_alive) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  wavelength_call_t *call = wavelength_call_create(env, info, work, NULL, &argc, argv);
  assert(argc == 1);

  void *wrapper;
  err = js_get_value_external(env, argv[0], &wrapper);
  assert(err == 0);

  call->subscription = [((wavelength_subscription_t *) wrapper)->subscription retain];

  return wavelength_call_dispatch(env, call, keeps_alive);
}

// An idle stream must not keep the worklet's loop alive on its own.
static js_value_t *
wavelength_subscriptionNext(js_env_t *env, js_callback_info_t *info) {
  return wavelength_queue_subscription_call(env, info, wavelength_work_subscriptionNext, false);
}

static js_value_t *
wavelength_subscriptionClose(js_env_t *env, js_callback_info_t *info) {
  return wavelength_queue_subscription_call(env, info, wavelength_work_subscriptionClose, true);
}

static js_value_t *
wavelength_exports(js_env_t *env, js_value_t *exports) {
  int err;

  wavelength_env_t *state = (wavelength_env_t *) calloc(1, sizeof(wavelength_env_t));
  state->env = env;

  err = js_add_deferred_teardown_callback(env, wavelength_teardown, state, &state->teardown);
  assert(err == 0);

#define V(name) \
  { \
    js_value_t *val; \
    err = js_create_function(env, #name, -1, wavelength_##name, state, &val); \
    assert(err == 0); \
    err = js_set_named_property(env, exports, #name, val); \
    assert(err == 0); \
  }

  V(start)
  V(startExternalSeedWallet)
  V(stop)
  V(getInfo)
  V(status)
  V(balance)
  V(createWallet)
  V(unlockWallet)
  V(openWalletFromPasskey)
  V(deposit)
  V(receive)
  V(prepareSend)
  V(sendPrepared)
  V(list)
  V(exit)
  V(exitStatus)
  V(exitSummary)
  V(getExitPlan)
  V(sweepWallet)
  V(confirmedBalanceSat)
  V(pendingInboundSat)
  V(walletReady)
  V(isRunning)
  V(subscribe)
  V(subscriptionNext)
  V(subscriptionClose)
#undef V

  return exports;
}

BARE_MODULE(wavelength_bare_addon, wavelength_exports)
