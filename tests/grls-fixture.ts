import example from "./grls-example.json";
import { grlsCatalog } from "../apps/web-doctor/src/workspace/grls";
export function installGrlsFixture() {
  grlsCatalog.install(example);
  return grlsCatalog.selection(example.records[0]!);
}
