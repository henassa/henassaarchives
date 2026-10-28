import { test } from "node:test";
import assert from "node:assert/strict";
import * as P from "../components/blindtest/lib/partie";

/* À lancer avec tsx : npx tsx --test tests/blindtest-points.test.ts */
const { gainsManche, rangs } = P;

test("points : le premier rafle, puis ça descend", () => {
  const trouves = { a: { titre: 3000, artiste: 9000 }, b: { titre: 1000 }, c: { titre: 5000, artiste: 2000 }, d: { titre: 6000 }, e: { titre: 7000 } };
  assert.deepEqual(rangs(trouves, "titre"), { b: 1, a: 2, c: 3, d: 4, e: 5 });
  assert.deepEqual(rangs(trouves, "artiste"), { c: 1, a: 2 });
  const g = gainsManche(trouves, 30000);
  assert.ok(g.b > g.d && g.d > g.e && g.a > g.b, JSON.stringify(g)); // a a trouvé les deux
  assert.equal(g.b, 200 + Math.round(20 * (1 - 1000 / 30000)));
  // ex æquo : même rang
  assert.deepEqual(rangs({ x: { titre: 100 }, y: { titre: 100 }, z: { titre: 200 } }, "titre"), { x: 1, y: 1, z: 3 });
});
