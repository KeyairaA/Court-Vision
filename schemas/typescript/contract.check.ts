// Compile-time assertions about the generated types. `npm run check` runs tsc
// over this file; if a generated type drifts into the wrong shape, it fails to
// compile. This is the guard that would have caught PlayerSeasons = number.

import type { ArtifactTypes, CareerRecord, LeagueSeasonRecord, PlayerSeasonRecord } from "./artifacts";

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assert = <T extends true>(): T => true as T;

assert<Equals<ArtifactTypes["player-seasons"], PlayerSeasonRecord[]>>();
assert<Equals<ArtifactTypes["careers"], CareerRecord[]>>();
assert<Equals<ArtifactTypes["league-trends"], LeagueSeasonRecord[]>>();

// Rates are nullable (zero denominators become null, never Infinity).
assert<Equals<PlayerSeasonRecord["ts_pct"], number | null>>();
// Counting stats never are.
assert<Equals<PlayerSeasonRecord["pts"], number>>();
// The grouping key the UI must use is always present.
assert<Equals<PlayerSeasonRecord["franchise_slug"], string>>();
// Manifest fields the UI shows as "last updated".
assert<Equals<ArtifactTypes["manifest"]["source"]["latest_published_at"], string | null>>();
