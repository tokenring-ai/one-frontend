import type { AgentEventEnvelope, AgentStatusSchema, InputExecutionStateSchema } from "@tokenring-ai/agent/AgentEvents";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { agentRPCClient } from "../rpc.ts";
import type { ChatMessage, QuestionInteraction } from "../types/agent-events.ts";

export type RemoteAgentStatus = Omit<AgentStatus, "status"> & {
  status: AgentStatus["status"] | "connecting";
};
type AgentStatus = z.output<typeof AgentStatusSchema>;
type InputExecutionState = z.output<typeof InputExecutionStateSchema>;

const INITIAL_AGENT_STATUS: RemoteAgentStatus = {
  type: "agent.status",
  status: "connecting",
  currentActivity: "Connecting to the agent...",
  timestamp: 0,
  inputExecutionQueue: [],
};

function hasMessage(event: AgentEventEnvelope): event is Extract<AgentEventEnvelope, { message: string }> {
  return "message" in event;
}

export function useAgentEventState(agentId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentStatus, setAgentStatus] = useState<RemoteAgentStatus>(INITIAL_AGENT_STATUS);
  const [position, setPosition] = useState(0);
  const [currentExecutionState, setCurrentExecutionState] = useState<InputExecutionState | null>();
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [_triggerReconnect, setTriggerReconnect] = useState(0);
  const [agentNotFound, setAgentNotFound] = useState(false);

  const stateRef = useRef({
    messages: [] as ChatMessage[],
    position: 0,
    agentStatus: INITIAL_AGENT_STATUS,
    inputExecutions: new Map<string, InputExecutionState>(),
    seenQuestionIds: new Set<string>(),
  });

  // Exponential backoff constants
  const MAX_RECONNECT_DELAY = 30000; // 30 seconds max
  const INITIAL_RECONNECT_DELAY = 1000; // 1 second initial
  const BACKOFF_MULTIPLIER = 1.5;

  useEffect(() => {
    const abortController = new AbortController();
    let reconnectDelay = INITIAL_RECONNECT_DELAY;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const attemptReconnection = () => {
      if (abortController.signal.aborted) return;

      reconnectDelay = Math.min(reconnectDelay * BACKOFF_MULTIPLIER, MAX_RECONNECT_DELAY);
      setReconnectAttempts(prev => prev + 1);

      reconnectTimeout = setTimeout(() => {
        setIsConnecting(true);
        setConnectionError(null);
      }, reconnectDelay);
    };

    void (async () => {
      let fromPosition = stateRef.current.position;
      const currentMessages = [...stateRef.current.messages];
      let currentAgentStatus = stateRef.current.agentStatus;
      const inputExecutions = new Map(stateRef.current.inputExecutions);
      const seenQuestionIds = new Set(stateRef.current.seenQuestionIds);

      const appendMessage = (event: ChatMessage) => {
        currentMessages.push(event);
      };

      const mergeStreamingMessage = (event: Extract<AgentEventEnvelope, { type: "output.chat" | "output.reasoning" }>) => {
        const lastIndex = currentMessages.length - 1;
        const lastMessage = currentMessages[lastIndex];
        if (lastMessage && lastMessage.type === event.type && hasMessage(lastMessage)) {
          currentMessages[lastIndex] = { ...lastMessage, message: lastMessage.message + event.message, timestamp: event.timestamp };
          return;
        }
        appendMessage(event);
      };

      const addQuestionPrompts = (requestId: string, interactions: QuestionInteraction[] = []) => {
        for (const interaction of interactions) {
          // Use composite key to ensure uniqueness across different requests
          const key = `${requestId}:${interaction.interactionId}`;
          if (seenQuestionIds.has(key)) continue;

          appendMessage({
            ...interaction,
            requestId,
          });
          seenQuestionIds.add(key);
        }
      };

      const runStream = async () => {
        while (!abortController.signal.aborted) {
          try {
            setIsConnecting(true);
            setConnectionError(null);

            for await (const eventsData of agentRPCClient.streamAgentEvents(
              {
                agentId,
                fromPosition,
              },
              abortController.signal,
            )) {
              if (eventsData.status === "agentNotFound") {
                setAgentNotFound(true);
                setIsConnecting(false);
                return;
              }

              if (eventsData.status !== "success") continue;

              // Reset reconnect delay on successful connection
              reconnectDelay = INITIAL_RECONNECT_DELAY;
              setReconnectAttempts(0);
              setIsConnecting(false);

              for (const event of eventsData.events) {
                switch (event.type) {
                  case "output.chat":
                  case "output.reasoning":
                    mergeStreamingMessage(event);
                    break;
                  case "agent.created":
                  case "agent.stopped":
                  case "agent.response":
                  case "output.artifact":
                  case "output.info":
                  case "output.warning":
                  case "output.error":
                  case "input.received":
                  case "input.interaction":
                  case "toolCall":
                    appendMessage(event);
                    break;
                  case "agent.status":
                    currentAgentStatus = event;
                    setCurrentExecutionState(inputExecutions.get(event.inputExecutionQueue[0]));
                    break;
                  case "input.execution":
                    if (event.status === "finished") {
                      inputExecutions.delete(event.requestId);
                    } else {
                      const prevEvent = inputExecutions.get(event.requestId);
                      inputExecutions.set(event.requestId, {
                        ...prevEvent,
                        ...event,
                      });
                      addQuestionPrompts(
                        event.requestId,
                        (event.availableInteractions ?? []).filter((interaction): interaction is QuestionInteraction => interaction.type === "question"),
                      );
                    }
                    break;
                  case "cancel":
                    break;
                  default: {
                    const _exhaustive: never = event;
                    throw new Error(`Unhandled event type: ${(_exhaustive as any).type}`);
                  }
                }
              }

              fromPosition = eventsData.position;
              stateRef.current = {
                messages: currentMessages,
                position: eventsData.position,
                agentStatus: currentAgentStatus,
                inputExecutions,
                seenQuestionIds,
              };

              setMessages([...currentMessages]);
              setAgentStatus(currentAgentStatus);
              setPosition(eventsData.position);
            }
          } catch (error: unknown) {
            if (abortController.signal.aborted) return;

            const errorMessage = Error.isError(error) ? error.message : "Unknown error";
            console.error("Stream error, scheduling reconnection...", errorMessage);
            setConnectionError(errorMessage);
            setIsConnecting(false);

            // Schedule reconnection with exponential backoff
            attemptReconnection();
          }
        }
      };

      await runStream();
    })();

    return () => {
      abortController.abort();
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [agentId]);

  return {
    messages,
    agentStatus,
    position,
    currentExecutionState,
    isConnecting,
    connectionError,
    reconnectAttempts,
    agentNotFound,
    manualReconnect: () => {
      // Reset reconnect attempts and trigger a reconnection
      setReconnectAttempts(0);
      setConnectionError(null);
      setTriggerReconnect(prev => prev + 1);
    },
  };
}
