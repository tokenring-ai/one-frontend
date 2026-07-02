import errorAsString from "@tokenring-ai/utility/error/errorAsString";
import { useEffect, useRef, useState } from "react";
import { resolvePreferredAgentType, type AgentTypeInfo } from "./agentTypeUtils.ts";
import { cleanupAgent } from "../lib/agentCleanup.ts";
import { agentRPCClient } from "../rpc.ts";

export type { AgentTypeInfo } from "./agentTypeUtils.ts";
export { resolvePreferredAgentType } from "./agentTypeUtils.ts";

export interface UseHeadlessAgentOptions {
  appName: string;
  preferredTypes?: readonly string[];
  resolvePreferred?: (types: AgentTypeInfo[]) => AgentTypeInfo | undefined;
  noTypesMessage?: string;
  onNoTypes?: (message: string) => void;
  onError?: (message: string) => void;
  headless?: boolean;
}

export interface UseHeadlessAgentResult {
  agentId: string | null;
  initialising: boolean;
  error: string | null;
}

/** Creates a headless agent on mount and cleans it up on unmount. */
export function useHeadlessAgent(options: UseHeadlessAgentOptions): UseHeadlessAgentResult {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [agentId, setAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialising, setInitialising] = useState(true);
  const agentRef = useRef<string | null>(null);

  useEffect(() => {
    const {
      appName,
      preferredTypes,
      resolvePreferred,
      noTypesMessage = "No agent types available",
      onNoTypes,
      onError,
      headless = true,
    } = optionsRef.current;

    let cancelled = false;
    void (async () => {
      try {
        const types = await agentRPCClient.getAgentTypes({});
        if (cancelled) return;

        const preferred = resolvePreferredAgentType(types, preferredTypes, resolvePreferred);
        if (!preferred) {
          if (!cancelled) {
            setError(noTypesMessage);
            onNoTypes?.(noTypesMessage);
            setInitialising(false);
          }
          return;
        }

        const { id } = await agentRPCClient.createAgent({ agentType: preferred.type, headless });
        if (cancelled) {
          cleanupAgent(id, `${appName} cancelled during init`);
          return;
        }
        agentRef.current = id;
        setAgentId(id);
      } catch (e: unknown) {
        if (!cancelled) {
          const message = errorAsString(e);
          setError(message);
          onError?.(message);
        }
      } finally {
        if (!cancelled) setInitialising(false);
      }
    })();

    return () => {
      cancelled = true;
      if (agentRef.current) {
        cleanupAgent(agentRef.current, `${appName} unmounted`);
        agentRef.current = null;
      }
    };
  }, []);

  return { agentId, initialising, error };
}