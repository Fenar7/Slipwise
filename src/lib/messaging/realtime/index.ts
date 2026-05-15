import "server-only";

/**
 * Realtime transport module — public API surface.
 *
 * Exports the protocol, token, session, gateway, and diagnostics contracts
 * needed to establish and manage authenticated WebSocket sessions for
 * Internal Messaging.
 */

// Protocol
export {
  REALTIME_PROTOCOL_VERSION,
  isValidClientCommand,
  getCommandType,
  getCommandRequestId,
} from "./protocol";
export type {
  BaseCommand,
  BaseServerMessage,
  ClientCommand,
  ServerMessage,
  SubscribeConversationCommand,
  UnsubscribeConversationCommand,
  HeartbeatCommand,
  ResumeSessionCommand,
  SetPresenceCommand,
  StartTypingCommand,
  StopTypingCommand,
  AckEventsCommand,
  SessionAckMessage,
  SubscriptionAckMessage,
  SubscriptionDeniedMessage,
  HeartbeatAckMessage,
  ResumeSessionResultMessage,
  ErrorMessage,
  DisconnectMessage,
  RealtimeEvent,
  RealtimeEventType,
  RealtimeErrorCode,
  TransportState,
} from "./protocol";

// Token
export {
  REALTIME_TOKEN_ALGORITHM,
  REALTIME_TOKEN_VERSION,
  DEFAULT_REALTIME_TOKEN_TTL_SECONDS,
  MAX_REALTIME_TOKEN_TTL_SECONDS,
  mintRealtimeSessionToken,
  verifyRealtimeSessionToken,
  tokenFingerprint,
} from "./token";
export type {
  RealtimeSessionClaims,
  MintTokenInput,
  MintTokenResult,
  VerifyTokenResult,
  TokenVerificationError,
} from "./token";

// Session
export {
  InMemorySessionRegistry,
  DEFAULT_SESSION_IDLE_TIMEOUT_MS,
} from "./session";
export type {
  RealtimeSession,
  SessionRegistryStats,
  SessionRegistry,
} from "./session";

// Subscription auth
export {
  authorizeConversationSubscription,
  reauthorizeConversationSubscription,
} from "./subscription-auth";
export type {
  SubscriptionAuthResult,
  SubscriptionAuthDiagnostic,
  SubscriptionAuthDetail,
} from "./subscription-auth";

// Diagnostics
export {
  ConsoleRealtimeDiagnostics,
  NoopRealtimeDiagnostics,
} from "./diagnostics";
export type {
  RealtimeDiagnosticEvent,
  RealtimeDiagnostics,
} from "./diagnostics";

// Gateway
export { MessagingGateway } from "./gateway";
export type {
  GatewayOptions,
  GatewayConnectionState,
} from "./gateway";

// Publisher
export {
  InMemoryRealtimePublisher,
  registerRealtimePublisher,
  getRealtimePublisher,
  getRealtimePublisherOrNoop,
} from "./publisher";
export type {
  RealtimePublisher,
} from "./publisher";

// Event log (Sprint 4.3)
export {
  appendConversationEvent,
  replayConversationEvents,
  generateMonotonicCursor,
  DEFAULT_REPLAY_LIMIT,
  DEFAULT_REPLAY_RETENTION_HOURS,
} from "./event-log-service";
export type {
  AppendConversationEventInput,
  AppendConversationEventResult,
  ReplayConversationEvent,
  ReplayResultStatus,
  ReplayConversationEventsResult,
} from "./event-log-service";

// Downstream seam (Sprint 4.4)
export {
  consumeDownstreamEvents,
  recordConsumptionCheckpoint,
  getConsumptionCheckpoint,
  getDownstreamEventCount,
  buildNotificationPayload,
  buildSearchIndexPayload,
  buildAnalyticsPayload,
  DEFAULT_DOWNSTREAM_CONSUMPTION_LIMIT,
} from "./downstream-seam";
export type {
  DownstreamConsumerType,
  DownstreamEvent,
  ConsumeDownstreamEventsInput,
  ConsumeDownstreamEventsResult,
  RecordConsumptionCheckpointInput,
  ConsumptionCheckpoint,
  NotificationEventPayload,
  SearchIndexEventPayload,
  AnalyticsEventPayload,
} from "./downstream-seam";

// Degraded mode (Sprint 4.4)
export {
  makeDegradedState,
  makeHealthyState,
  isAdvisoryDegradation,
  requiresRehydration,
} from "./degraded-mode";
export type {
  DegradedModeReason,
  DegradedState,
  HealthyState,
  TransportHealthState,
  ConnectionStateMessage,
  DegradedModeMessage,
} from "./degraded-mode";

// Safety limits (Sprint 4.4)
export {
  DEFAULT_SAFETY_LIMITS,
  SessionRateLimiter,
  createBackpressureState,
} from "./safety-limits";
export type {
  SafetyLimits,
  RateLimitWindow,
  BackpressureState,
} from "./safety-limits";
