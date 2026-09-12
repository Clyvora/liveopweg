# AI Assistant Task Prompt - Liveopweg Bug Fixes

You are an expert TypeScript/React developer tasked with fixing critical bugs in the **liveopweg** repository. This is a real-time train tracking and mobility dashboard application.

## 🎯 Your Mission

Fix all identified bugs in this priority order. Make code changes **only** - do not create documentation files or explanatory files. Work methodically through each issue.

---

## 🔴 TASK 1: Fix Date.parse() Validation (HIGHEST PRIORITY)

**What's Wrong**: `Date.parse()` is called 20+ times without validating the result. When given invalid timestamps, it returns `NaN`, silently breaking all time-based logic.

**Files to Fix**:
1. `app/StationPanel.tsx` - Lines 76, 77, 84
2. `app/ReplayPanel.tsx` - Lines 65, 66, 85, 97, 98, 103
3. `app/MobilityDashboard.tsx` - Lines 304, 305, 640, 641, 1621
4. `packages/domain-rail/client-motion.ts` - Line 41
5. `app/TrainPanel.tsx` - Lines 13, 24, 32

**Implementation Strategy**:
1. Create a utility function in `app/realtime-url.ts` or new `app/utils/date-utils.ts`:
```typescript
export function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isValidTimestamp(value: string | null | undefined): boolean {
  return parseTimestamp(value) !== null;
}
```

2. Replace all `Date.parse()` calls with this utility
3. Add null checks in all comparisons
4. Test with edge cases: empty strings, "invalid", malformed ISO dates

**Expected Result**: Time-based filtering and stale detection work reliably.

---

## 🔴 TASK 2: Add Error Logging to Catch Blocks (HIGH PRIORITY)

**What's Wrong**: Errors are silently swallowed with empty catch blocks. This makes debugging impossible in production.

**Files to Fix**:
1. `app/MobilityDashboard.tsx` - Line ~603 (geometry fetch error)
2. `app/ReplayPanel.tsx` - Lines 49, 88 (catalog/replay fetch)
3. `app/Utrecht3DView.tsx` - Line 155 (initialization)

**Implementation Strategy**:
1. Add console.error with structured logging:
```typescript
.catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error("[API_ERROR:GeometryFetch]", {
    timestamp: new Date().toISOString(),
    error: errorMessage,
    context: "requestTrackGeometries",
  });
  // Graceful fallback - continue without geometry
});
```

2. Include relevant context (file being loaded, vehicle ID, etc.)
3. Use consistent error format: `[COMPONENT:Operation]`

**Expected Result**: All errors are logged with context for debugging.

---

## 🔴 TASK 3: Fix Null Reference Safety in StationPanel (HIGH PRIORITY)

**What's Wrong**: Line 76 of `app/StationPanel.tsx` accesses `board.generatedAt` without guaranteed null check.

**File**: `app/StationPanel.tsx`

**Current Code** (Line 76):
```typescript
const stale = !board?.sourceHealthy || error || now - Date.parse(board.generatedAt) > 45_000;
```

**Fix**:
```typescript
const generatedTime = board?.generatedAt ? Date.parse(board.generatedAt) : null;
const stale = !board?.sourceHealthy || error || generatedTime === null || now - generatedTime > 45_000;
```

**Alternative**: Use the date utility from Task 1:
```typescript
const generatedTime = parseTimestamp(board?.generatedAt);
const stale = !board?.sourceHealthy || error || generatedTime === null || now - generatedTime > 45_000;
```

**Expected Result**: No undefined behavior, code is clear and maintainable.

---

## 🟡 TASK 4: Validate API Response Schemas (MEDIUM PRIORITY)

**What's Wrong**: API responses are cast with `as unknown` but not validated. Unexpected API changes silently break features.

**Files to Fix**:
1. `app/MobilityDashboard.tsx` - Line ~608 (geometry response)
2. `app/ReplayPanel.tsx` - Line ~45 (catalog response)

**Implementation Strategy**:
1. Use existing Zod schemas already in codebase:
```typescript
// Instead of: as { features?: Array<{...}> }
const payload = await response.json();
const validated = z.array(railGeometryFeatureSchema).parse(payload.features);
```

2. Check if schemas exist in `packages/protocol/` - use them
3. If not, create minimal validation schemas
4. Wrap parsing in try-catch with error logging (use Task 2 pattern)

**Expected Result**: API response shape is guaranteed; unexpected changes fail loudly with clear errors.

---

## 🟡 TASK 5: Add WebSocket Reconnection State Sync (MEDIUM PRIORITY)

**What's Wrong**: When WebSocket reconnects, there's no mechanism to re-sync vehicle states. Updates could be lost.

**File**: `app/MobilityDashboard.tsx` - Reconnection logic (~1620+)

**Implementation Strategy**:
1. Track a sequence number for each update type (vehicle, match, road)
2. On reconnection, add a sync request:
```typescript
const connect = () => {
  setConnection(latestSequence !== null ? "herstellen" : "verbinden");
  
  socketRef.current = new WebSocket(realtimeWebSocketUrl("/v1/live"));
  socketRef.current.onopen = () => {
    // Request full state sync on reconnect
    if (latestSequence !== null) {
      socketRef.current?.send(JSON.stringify({
        protocolVersion: 2,
        type: "sync",
        lastSequence: latestSequence,
      }));
    }
  };
};
```

3. Implement deduplication logic for messages received during recovery
4. Test: Kill network, reconnect, verify no duplicate vehicles

**Expected Result**: Vehicle state remains consistent after reconnection.

---

## 🟡 TASK 6: Add Memory Limits to Vehicle Maps (MEDIUM PRIORITY)

**What's Wrong**: `motionSamplesRef` and `trackMotionSamplesRef` can grow unbounded, causing memory leaks.

**File**: `app/MobilityDashboard.tsx` - Lines 512-515, and update logic (~1470-1540)

**Implementation Strategy**:
1. Set max size limit (e.g., 5000 vehicles):
```typescript
const MAX_VEHICLE_SAMPLES = 5000;

// In the update/batch processing logic (~1500):
if (motionSamplesRef.current.size > MAX_VEHICLE_SAMPLES) {
  const entriesToDelete = Array.from(motionSamplesRef.current.keys())
    .slice(0, Math.floor(MAX_VEHICLE_SAMPLES * 0.2)); // Remove oldest 20%
  for (const key of entriesToDelete) {
    motionSamplesRef.current.delete(key);
    trackMotionSamplesRef.current.delete(key);
  }
  console.warn(`[Memory] Trimmed vehicle samples from ${motionSamplesRef.current.size + entriesToDelete.length} to ${motionSamplesRef.current.size}`);
}
```

2. Add similar logic for `trackGeometriesRef`
3. Log when trimming occurs

**Expected Result**: Memory usage stays bounded even on very long sessions.

---

## 🟢 TASK 7: Fix Race Condition in Vehicle Selection (LOW-MEDIUM PRIORITY)

**What's Wrong**: Rapid train selections could cause animation state inconsistency.

**File**: `app/MobilityDashboard.tsx` - `selectVehicle` function (~685)

**Fix**:
```typescript
const selectVehicle = useCallback((vehicleId: string, focusMap = true) => {
  const selected = vehiclesById[vehicleId];
  if (!selected) return;
  
  // Clear animation state from previous selection
  trainSwitchAnimationRef.current = null;
  previousVehicleIdRef.current = null;
  
  // Now set up new animation if switching
  if (selectedVehicleIdRef.current && selectedVehicleIdRef.current !== vehicleId) {
    previousVehicleIdRef.current = selectedVehicleIdRef.current;
    trainSwitchAnimationRef.current = { startTime: Date.now(), duration: 400 };
  }
  
  // Rest of selection logic...
  setSelectedVehicleId(vehicleId);
  selectedVehicleIdRef.current = vehicleId;
  // ...
}, [vehiclesById]);
```

**Expected Result**: No animation glitches when selecting trains rapidly.

---

## ✅ Testing & Verification

After completing each task:

1. **Run tests**: `npm test`
2. **Build check**: `npm run build`
3. **Manual testing** (for critical tasks):
   - Task 1: Open DevTools console, verify timestamps parse correctly
   - Task 2: Trigger network error, check console for error logs
   - Task 3: Hover over station panels, verify no console errors
   - Task 5: Kill network, reconnect, verify vehicles update
   - Task 6: Run app for 30+ minutes, check memory usage

---

## 📊 Progress Tracking

Mark completed tasks:

- [ ] Task 1: Date.parse() validation
- [ ] Task 2: Error logging
- [ ] Task 3: Null reference fix
- [ ] Task 4: API schema validation
- [ ] Task 5: WebSocket sync
- [ ] Task 6: Memory limits
- [ ] Task 7: Selection race condition
- [ ] Final: `npm test` passes, `npm run build` succeeds

---

## 🚨 Important Notes

1. **Do NOT create new files** unless absolutely necessary
2. **Preserve existing logic** - only fix the identified issues
3. **Use consistent patterns** - follow existing code style
4. **Test thoroughly** - these are reliability fixes
5. **Avoid conflicts** - coordinate if another AI is also making changes
6. **Performance** - ensure fixes don't add significant overhead

---

**Ready to start? Begin with Task 1 (Date.parse validation) as it affects multiple files and highest priority.**
