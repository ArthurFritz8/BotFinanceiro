import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeJsonParse } from "../src/safe-json-parse.js";

describe("safeJsonParse", () => {
  void it("retorna ok=true com valor tipado para JSON válido", () => {
    const result = safeJsonParse('{"a":1}');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value, { a: 1 });
    }
  });

  void it("retorna ok=false com reason=parse_error para JSON inválido", () => {
    const result = safeJsonParse("{broken");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "parse_error");
      assert.ok(result.error instanceof SyntaxError);
    }
  });

  void it("retorna ok=false com reason=not_string para inputs não-string", () => {
    for (const input of [null, undefined, 42, { foo: 1 }, ["bar"], true]) {
      const result = safeJsonParse(input);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.reason, "not_string");
      }
    }
  });
});
