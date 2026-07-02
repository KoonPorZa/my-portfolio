import { Type } from "@sinclair/typebox";

const NullableString = Type.Union([Type.String(), Type.Null()]);
const NullableNumber = Type.Union([Type.Number(), Type.Null()]);

export const TripParamsSchema = Type.Object({
  tripId: Type.String(),
});

export const ViewerQuerySchema = Type.Object({
  t: Type.Optional(Type.String()),
});

export const StartSessionBodySchema = Type.Object(
  {
    code: Type.Optional(Type.String()),
  },
  { additionalProperties: true }
);

export const StopSessionBodySchema = Type.Object(
  {
    sessionId: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
    action: Type.Optional(Type.Union([Type.Literal("stop"), Type.Literal("revoke")])),
  },
  { additionalProperties: true }
);

export const ProgressBodySchema = Type.Object(
  {
    stopIndex: Type.Integer({ minimum: 0 }),
    arrivedAt: Type.Optional(NullableString),
    action: Type.Optional(Type.Union([Type.Literal("set"), Type.Literal("clear")])),
  },
  { additionalProperties: true }
);

export const LocationPayloadSchema = Type.Object(
  {
    sessionId: Type.String({ minLength: 1, maxLength: 128 }),
    seq: Type.Integer({ minimum: 0 }),
    lat: Type.Number(),
    lng: Type.Number(),
    accuracyM: Type.Number(),
    speedMps: Type.Optional(NullableNumber),
    headingDeg: Type.Optional(NullableNumber),
    clientTs: Type.String({ minLength: 1 }),
    mode: Type.Union([
      Type.Literal("active"),
      Type.Literal("saver"),
      Type.Literal("rest"),
      Type.Literal("city"),
    ]),
    reason: Type.Union([
      Type.Literal("scheduled"),
      Type.Literal("manual"),
      Type.Literal("start"),
      Type.Literal("stop"),
      Type.Literal("retry"),
    ]),
  },
  { additionalProperties: true }
);

const SessionAuditSchema = Type.Object({
  lastViewerAccessAt: NullableString,
  uploadCount: Type.Number(),
  lastError: NullableString,
});

const LocationLatestSchema = Type.Object({
  lat: Type.Number(),
  lng: Type.Number(),
  accuracyM: Type.Number(),
  speedMps: Type.Optional(NullableNumber),
  headingDeg: Type.Optional(NullableNumber),
  mode: Type.Optional(Type.String()),
  reason: Type.Optional(Type.String()),
  clientTs: Type.String(),
  serverTs: Type.String(),
});

const LocationTrackPointSchema = Type.Intersect([
  LocationLatestSchema,
  Type.Object({
    seq: Type.Number(),
  }),
]);

const PublicSessionSchema = Type.Object({
  id: Type.String(),
  tripId: Type.String(),
  active: Type.Boolean(),
  expiresAt: Type.String(),
  stoppedAt: NullableString,
  revokedAt: NullableString,
});

const StopArrivalSchema = Type.Object({
  index: Type.Number(),
  arrivedAt: Type.String(),
  source: Type.Union([Type.Literal("auto"), Type.Literal("manual")]),
});

export const UploadLocationResponseSchema = Type.Object({
  ok: Type.Literal(true),
  latest: LocationLatestSchema,
  audit: Type.Union([SessionAuditSchema, Type.Null()]),
});

export const ViewerLatestResponseSchema = Type.Object({
  status: Type.Union([Type.Literal("active"), Type.Literal("stopped")]),
  freshness: Type.Union([
    Type.Literal("fresh"),
    Type.Literal("stale"),
    Type.Literal("offline"),
    Type.Null(),
  ]),
  viewerState: Type.Union([
    Type.Literal("loading"),
    Type.Literal("invalid/expired"),
    Type.Literal("waiting-first-gps"),
    Type.Literal("fresh"),
    Type.Literal("stale"),
    Type.Literal("offline"),
    Type.Literal("stopped"),
  ]),
  latest: Type.Union([LocationLatestSchema, Type.Null()]),
  track: Type.Array(LocationTrackPointSchema),
  stopArrivals: Type.Array(StopArrivalSchema),
  audit: Type.Union([SessionAuditSchema, Type.Null()]),
  nextPollMs: Type.Number(),
  message: Type.String(),
});

export const CreateSessionResponseSchema = Type.Object({
  ok: Type.Literal(true),
  session: PublicSessionSchema,
  ownerToken: Type.String(),
  viewerToken: Type.String(),
  viewerLink: Type.String(),
});

export const StopSessionResponseSchema = Type.Object({
  ok: Type.Literal(true),
  session: PublicSessionSchema,
});

export const ProgressResponseSchema = Type.Object({
  ok: Type.Literal(true),
  stopArrivals: Type.Array(StopArrivalSchema),
});

export const ErrorResponseSchema = Type.Object({
  error: Type.String(),
  message: Type.String(),
  // Echoed request id so a user can quote it when reporting an error (Phase 16).
  requestId: Type.Optional(Type.String()),
});

// Superset object: fallback=false → all fields present; fallback=true → only reason present.
// Using a superset (all fields optional except fallback) avoids Type.Union branch-selection
// issues in fast-json-stringify that can silently drop fields.
export const GoogleRouteResponseSchema = Type.Object({
  fallback: Type.Boolean(),
  reason: Type.Optional(
    Type.Union([
      Type.Literal("disabled"),
      Type.Literal("quota"),
      Type.Literal("upstream_error"),
    ])
  ),
  encodedPolyline: Type.Optional(Type.String()),
  distanceMeters: Type.Optional(Type.Number()),
  durationSeconds: Type.Optional(Type.Number()),
  source: Type.Optional(Type.Literal("google")),
  cachedAt: Type.Optional(Type.String()),
  expiresAt: Type.Optional(Type.String()),
});
