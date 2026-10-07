import { useCallback, useState } from "react";
import { latestRoomRecord } from "@/lib/cancelledMatchRoom";

export function useRoomRecord() {
  const [record, setRecord] = useState(null);
  const update = useCallback((value) => setRecord((previous) => latestRoomRecord(previous, typeof value === "function" ? value(previous) : value)), []);
  return [record, update];
}
