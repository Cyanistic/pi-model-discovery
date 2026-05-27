import test from "node:test";
import assert from "node:assert/strict";

import type { DiscoveryPaginationConfig } from "../../src/config/types.js";
import { appendPaginationCursor, readPaginationState } from "../../src/discovery/pagination.js";

const pagination: DiscoveryPaginationConfig = {
  enabled: true,
  cursorParam: "after",
  nextCursorField: "meta.next.cursor",
  hasMoreField: "meta.has_more",
};

test("pagination state treats non-boolean has_more as cursor-driven", () => {
  assert.deepEqual(
    readPaginationState(
      {
        meta: {
          has_more: "true",
          next: { cursor: "page-2" },
        },
      },
      pagination,
    ),
    { hasMore: true, nextCursor: "page-2" },
  );
});

test("pagination state ignores non-string nested cursors", () => {
  assert.deepEqual(
    readPaginationState(
      {
        meta: {
          has_more: true,
          next: { cursor: { value: "page-2" } },
        },
      },
      pagination,
    ),
    { hasMore: true, nextCursor: undefined },
  );
});

test("pagination cursor appending preserves reserved cursor characters", () => {
  assert.equal(
    appendPaginationCursor("https://api.example.invalid/v1/models?limit=10", "after", "next/page+1?x=1&y=2"),
    "https://api.example.invalid/v1/models?limit=10&after=next%2Fpage%2B1%3Fx%3D1%26y%3D2",
  );
});
