export function createCapabilityMarginRequestGuard() {
  let latestRequestId = 0;

  return {
    begin() {
      latestRequestId += 1;
      return latestRequestId;
    },
    isLatest(requestId: number, aborted: boolean) {
      return requestId === latestRequestId && !aborted;
    },
  };
}
