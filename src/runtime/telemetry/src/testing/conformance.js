// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __using = (stack, value, async) => {
  if (value != null) {
    if (typeof value !== "object" && typeof value !== "function") __typeError("Object expected");
    var dispose;
    if (async) dispose = value[__knownSymbol("asyncDispose")];
    if (dispose === void 0) dispose = value[__knownSymbol("dispose")];
    if (typeof dispose !== "function") __typeError("Object not disposable");
    stack.push([async, dispose, value]);
  } else if (async) {
    stack.push([async]);
  }
  return value;
};
var __callDispose = (stack, error, hasError) => {
  var E = typeof SuppressedError === "function" ? SuppressedError : function(e, s, m, _) {
    return _ = Error(m), _.name = "SuppressedError", _.error = e, _.suppressed = s, _;
  };
  var fail2 = (e) => error = hasError ? new E(e, error, "An error was suppressed during disposal") : (hasError = true, e);
  var next = (it) => {
    while (it = stack.pop()) {
      try {
        var result = it[1] && it[1].call(it[2]);
        if (it[0]) return Promise.resolve(result).then(next, (e) => (fail2(e), next()));
      } catch (e) {
        fail2(e);
      }
    }
    if (hasError) throw error;
  };
  return next();
};
import { deepStrictEqual, doesNotThrow, fail, ok, strictEqual } from "node:assert/strict";
function createCase(factory, group, name, test) {
  return {
    group,
    name,
    async run() {
      var _stack = [];
      try {
        const fixture = __using(_stack, await factory(), true);
        await test(fixture);
      } catch (_) {
        var _error = _, _hasError = true;
      } finally {
        var _promise = __callDispose(_stack, _error, _hasError);
        _promise && await _promise;
      }
    }
  };
}
function findSpan(spans, name) {
  const span = spans.find((candidate) => candidate.name === name);
  ok(span, `Expected recorded span ${name}`);
  return span;
}
async function rejectsWithSameValue(operation, expected) {
  try {
    await operation;
    fail("Expected operation to reject");
  } catch (error) {
    strictEqual(error, expected);
  }
}
function unreadable(value) {
  return new Proxy(value, {
    get: () => {
      throw new Error("read");
    },
    getOwnPropertyDescriptor: () => {
      throw new Error("inspect");
    },
    getPrototypeOf: () => {
      throw new Error("prototype");
    },
    ownKeys: () => {
      throw new Error("enumerate");
    }
  });
}
function createTelemetryAdapterConformance(factory) {
  return [
    createCase(
      factory,
      "callback lifecycle",
      "admits once synchronously and preserves the result",
      async (fixture) => {
        let admitted = false;
        let calls = 0;
        const expected = { value: 42 };
        const result = fixture.context.startSpan({ name: "success" }, () => {
          admitted = true;
          calls++;
          return expected;
        });
        strictEqual(admitted, true);
        strictEqual(calls, 1);
        strictEqual(await result, expected);
        deepStrictEqual(findSpan(await fixture.getSpans(), "success").status, { status: "ok" });
        strictEqual(findSpan(await fixture.getSpans(), "success").settled, true);
      }
    ),
    createCase(
      factory,
      "callback lifecycle",
      "preserves synchronous and asynchronous rejection values",
      async (fixture) => {
        const syncError = new Error("sync");
        await rejectsWithSameValue(
          fixture.context.startSpan({ name: "sync-error" }, () => {
            throw syncError;
          }),
          syncError
        );
        const asyncError = { kind: "async" };
        await rejectsWithSameValue(
          fixture.context.startSpan({ name: "async-error" }, async () => {
            throw asyncError;
          }),
          asyncError
        );
        await rejectsWithSameValue(
          fixture.context.startSpan({ name: "undefined-error" }, () => Promise.reject(void 0)),
          void 0
        );
        const unreadableError = unreadable({ kind: "unreadable" });
        await rejectsWithSameValue(
          fixture.context.startSpan({ name: "unreadable-error" }, () => {
            throw unreadableError;
          }),
          unreadableError
        );
        const asyncUnreadableError = unreadable({ kind: "async-unreadable" });
        await rejectsWithSameValue(
          fixture.context.startSpan(
            { name: "async-unreadable-error" },
            () => Promise.reject(asyncUnreadableError)
          ),
          asyncUnreadableError
        );
        const spans = await fixture.getSpans();
        for (const name of [
          "sync-error",
          "async-error",
          "undefined-error",
          "unreadable-error",
          "async-unreadable-error"
        ]) {
          strictEqual(findSpan(spans, name).status.status, "error");
        }
      }
    ),
    createCase(factory, "status", "uses last explicit status without automatic overwrite", async (fixture) => {
      await fixture.context.startSpan({ name: "last-status" }, (span) => {
        span.setStatus({ status: "error", error: { name: "Expected", message: "first" } });
        span.setStatus({ status: "ok" });
      });
      const thrown = new Error("after explicit status");
      await rejectsWithSameValue(
        fixture.context.startSpan({ name: "explicit-before-throw" }, (span) => {
          span.setStatus({ status: "ok" });
          throw thrown;
        }),
        thrown
      );
      const rejected = new Error("after async explicit status");
      await rejectsWithSameValue(
        fixture.context.startSpan({ name: "explicit-before-rejection" }, (span) => {
          span.setStatus({ status: "error", error: { name: "Expected", message: "async failure" } });
          return Promise.reject(rejected);
        }),
        rejected
      );
      await fixture.context.startSpan({ name: "expected-failure" }, (span) => {
        span.setStatus({ status: "error", error: { name: "Expected", message: "returned failure" } });
        return { ok: false };
      });
      const spans = await fixture.getSpans();
      deepStrictEqual(findSpan(spans, "last-status").status, { status: "ok" });
      deepStrictEqual(findSpan(spans, "explicit-before-throw").status, { status: "ok" });
      deepStrictEqual(findSpan(spans, "explicit-before-rejection").status, {
        status: "error",
        error: { name: "Expected", message: "async failure" }
      });
      deepStrictEqual(findSpan(spans, "expected-failure").status, {
        status: "error",
        error: { name: "Expected", message: "returned failure" }
      });
    }),
    createCase(factory, "recording", "merges attributes and records ordered events", async (fixture) => {
      await fixture.context.startSpan(
        {
          name: "recording",
          attributes: { start: "value", overwrite: "start", ignored: void 0 }
        },
        (span2) => {
          span2.setAttributes({ count: 1, overwrite: "middle" });
          span2.setAttributes({ count: void 0, overwrite: "end" });
          span2.addEvent("first", { index: 1, ignored: void 0 });
          span2.addEvent("second", { index: 2 });
        }
      );
      const span = findSpan(await fixture.getSpans(), "recording");
      deepStrictEqual(span.attributes, { start: "value", overwrite: "end", count: 1 });
      deepStrictEqual(span.events, [
        { name: "first", attributes: { index: 1 } },
        { name: "second", attributes: { index: 2 } }
      ]);
    }),
    createCase(factory, "recording", "ignores failed attribute calls atomically", async (fixture) => {
      await fixture.context.startSpan({ name: "atomic-attributes", attributes: { retained: "value" } }, (span) => {
        const attributes = {
          partial: "must not survive",
          unreadable: unreadable(["value"])
        };
        doesNotThrow(() => span.setAttributes(attributes));
      });
      deepStrictEqual(findSpan(await fixture.getSpans(), "atomic-attributes").attributes, {
        retained: "value"
      });
    }),
    createCase(factory, "recording", "makes calls after settlement inert", async (fixture) => {
      let settledSpan;
      await fixture.context.startSpan({ name: "settled", attributes: { value: "initial" } }, (span) => {
        settledSpan = span;
      });
      const capturedSpan = settledSpan;
      if (!capturedSpan) throw new Error("Expected callback span");
      doesNotThrow(() => capturedSpan.setAttributes({ value: "late" }));
      doesNotThrow(() => capturedSpan.addEvent("late", { value: true }));
      doesNotThrow(() => capturedSpan.setStatus({ status: "error" }));
      let childAdmitted = false;
      const childResult = capturedSpan.startSpan({ name: "late-child" }, () => {
        childAdmitted = true;
        return 7;
      });
      strictEqual(childAdmitted, true);
      strictEqual(await childResult, 7);
      const spans = await fixture.getSpans();
      strictEqual(spans.length, 1);
      deepStrictEqual(spans[0]?.attributes, { value: "initial" });
      deepStrictEqual(spans[0]?.events, []);
      deepStrictEqual(spans[0]?.status, { status: "ok" });
    }),
    createCase(factory, "parentage", "records nested and concurrent child relationships", async (fixture) => {
      let releaseFirst;
      const firstGate = new Promise((resolve) => {
        releaseFirst = resolve;
      });
      await fixture.context.startSpan({ name: "parent" }, async (parent2) => {
        const first2 = parent2.startSpan({ name: "first-child" }, async () => {
          await firstGate;
        });
        const second2 = parent2.startSpan({ name: "second-child" }, () => "done");
        strictEqual(await second2, "done");
        releaseFirst?.();
        await first2;
      });
      const spans = await fixture.getSpans();
      const parent = findSpan(spans, "parent");
      const first = findSpan(spans, "first-child");
      const second = findSpan(spans, "second-child");
      strictEqual(parent.parentId, null);
      strictEqual(first.parentId, parent.id);
      strictEqual(second.parentId, parent.id);
      ok(second.endSequence !== void 0 && first.endSequence !== void 0 && parent.endSequence !== void 0);
      ok(second.endSequence < first.endSequence);
      ok(first.endSequence < parent.endSequence);
    }),
    createCase(factory, "passivity", "suppresses unreadable telemetry payload failures", async (fixture) => {
      let calls = 0;
      const options = unreadable({ name: "unreadable-options", attributes: { secret: "value" } });
      const result = fixture.context.startSpan(options, () => {
        calls++;
        return 9;
      });
      strictEqual(calls, 1);
      strictEqual(await result, 9);
      deepStrictEqual(await fixture.getSpans(), []);
      await fixture.context.startSpan({ name: "unreadable-recording" }, (span) => {
        const attributes = unreadable({ secret: "value" });
        const status = unreadable({ status: "ok" });
        doesNotThrow(() => span.setAttributes(attributes));
        doesNotThrow(() => span.addEvent("unreadable-event", attributes));
        doesNotThrow(() => span.setStatus(status));
      });
      const recorded = await fixture.getSpans();
      strictEqual(recorded.length, 1);
      deepStrictEqual(recorded[0]?.attributes, {});
      deepStrictEqual(recorded[0]?.events, []);
      deepStrictEqual(recorded[0]?.status, { status: "ok" });
    }),
    createCase(factory, "passivity", "ignores failed status calls atomically", async (fixture) => {
      const rejection = new Error("rejected after unreadable status");
      await rejectsWithSameValue(
        fixture.context.startSpan({ name: "unreadable-status" }, (span) => {
          const status = unreadable({ status: "ok" });
          doesNotThrow(() => span.setStatus(status));
          return Promise.reject(rejection);
        }),
        rejection
      );
      strictEqual(findSpan(await fixture.getSpans(), "unreadable-status").status.status, "error");
    })
  ];
}
export {
  createTelemetryAdapterConformance
};
