import { useCallback, useState } from "react";
import { orchestrateAi, type OrchestrateRequest, type OrchestrateResponse } from "@/lib/ai-client";

export function useAiOrchestrator() {
  const [data, setData] = useState<OrchestrateResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const run = useCallback(async (input: OrchestrateRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await orchestrateAi(input);
      setData(result);
      return result;
    } catch (nextError) {
      const errorObject = nextError instanceof Error ? nextError : new Error(String(nextError));
      setError(errorObject);
      throw errorObject;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { data, error, isLoading, run, reset };
}
