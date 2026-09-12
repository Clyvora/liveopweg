# Liveopweg Bug Fix Requirements

## Overview
This document outlines all identified bugs and issues that need to be fixed in the liveopweg codebase. All items below must be addressed to improve code reliability, maintainability, and observability.

---

## 🔴 CRITICAL BUGS (Must Fix)

### 1. Date.parse() Returns NaN Without Validation
**Severity**: HIGH  
**Files Affected**: 
- `app/StationPanel.tsx` (lines 76, 77, 84)
- `app/ReplayPanel.tsx` (lines 65, 66, 85)
- `app/MobilityDashboard.tsx` (lines 304-305, 640-641, 1621)
- `packages/domain-rail/client-motion.ts` (line 41)
- `app/TrainPanel.tsx` (line 13, 24, 32)

**Problem**:
```typescript
// WRONG - No validation for malformed dates
const stale = !board?.sourceHealthy || error || now - Date.parse(board.generatedAt) > 45_000;
const from = Math.max(Date.parse(catalog.availableFrom), until - 20 * 60_000);
```
When `Date.parse()` receives invalid input, it returns `NaN`. Subsequent comparisons with `NaN` always return `false`, causing silent logic failures.

**Required Fix**:
```typescript
// CORRECT - Validate Date.parse() results
const parsedTime = Date.parse(board.generatedAt);
const stale = !board?.sourceHealthy || error || !Number.isFinite(parsedTime) || now - parsedTime > 45_000;

// OR create a helper function
function parseTimestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
```

**Impact**: Time-based filtering, stale data detection, and replay timing all potentially broken.

---

### 2. Unsafe Null Reference in StationPanel.tsx (Line 76)
**Severity**: MEDIUM  
**File**: `app/StationPanel.tsx`

**Problem**:
```typescript
const stale = !board?.sourceHealthy || error || now - Date.parse(board.generatedAt) > 45_000;
```
While this works due to short-circuit evaluation, accessing `board.generatedAt` when `board` could be null is dangerous and confusing. If short-circuit logic changes, this breaks.

**Required Fix**:
```typescript
// Option 1: Explicit null check
const stale = !board?.sourceHealthy || error || (board ? now - Date.parse(board.generatedAt) > 45_000 : true);

// Option 2: Use optional chaining
const generatedTime = board?.generatedAt ? Date.parse(board.generatedAt) : null;
const stale = !board?.sourceHealthy || error || generatedTime === null || now - generatedTime > 45_000;
```

---

### 3. Silent Error Swallowing - No Observability
**Severity**: HIGH  
**Files Affected**:
- `app/MobilityDashboard.tsx` (line ~595-603)
- `app/ReplayPanel.tsx` (line ~48-49, 88-89)
- `app/Utrecht3DView.tsx` (line ~155)

**Problem**:
```typescript
// BAD - Silent failure, no logging
.catch(() => {
  // A geometry error must not block the live fleet.
});

.catch(() => { if (!disposed) setState("ERROR"); });
```

When network requests fail, errors are silently ignored or state is set without any debugging information. Production issues become impossible to diagnose.

**Required Fix**:
```typescript
// GOOD - Log errors for debugging
.catch((error) => {
  console.error("[Geometry Request Failed]", {
    timestamp: new Date().toISOString(),
    edgeIds: missing.slice(0, 5),
    error: error instanceof Error ? error.message : String(error),
  });
  // Continue with graceful degradation
});
```

---

### 4. Memory Leak: Unbounded Map Growth
**Severity**: MEDIUM  
**File**: `app/MobilityDashboard.tsx` (lines 512-515)

**Problem**:
```typescript
const motionSamplesRef = useRef(new Map<string, MotionSample>());
const trackMotionSamplesRef = useRef(new Map<string, TrackMotionSample>());
```

If vehicle cleanup logic fails or vehicles accumulate over long sessions, these maps grow unbounded, consuming memory.

**Required Fix**:
1. Add cleanup verification (lines ~1449, 1515)
2. Add max size limits:
```typescript
const motionSamplesRef = useRef(new Map<string, MotionSample>());

// In update logic
if (motionSamplesRef.current.size > 5000) {
  console.warn("[Motion Memory] Clearing old samples, size:", motionSamplesRef.current.size);
  // Implement LRU or time-based cleanup
}
```

---

## 🟡 MEDIUM PRIORITY ISSUES (Should Fix)

### 5. WebSocket Reconnection State Inconsistency
**Severity**: MEDIUM  
**File**: `app/MobilityDashboard.tsx` (line ~1620+)

**Problem**:
When WebSocket disconnects and reconnects, there's no mechanism to ensure all vehicle states are synchronized. Some updates may be lost or duplicated.

**Required Fix**:
```typescript
// Track sequence numbers for deduplication
let latestProcessedSequence = 0;

const connect = () => {
  // Reset sequence tracking on reconnect
  latestProcessedSequence = 0;
  // Request full state sync
  socketRef.current?.send(JSON.stringify({ 
    protocolVersion: 2, 
    type: "sync", 
    action: "full" 
  }));
};
```

---

### 6. No Validation of API Response Data
**Severity**: MEDIUM  
**Files Affected**:
- `app/MobilityDashboard.tsx` (~595-630)
- `app/ReplayPanel.tsx` (~45-55)

**Problem**:
```typescript
const payload = await response.json() as {
  features?: Array<{ ... }>;
};
// Directly uses payload.features without full validation
```

If API returns unexpected structure, parsing silently fails.

**Required Fix**:
```typescript
// Use schema validation for all API responses
const payload = railGeometryResponseSchema.parse(await response.json());
// Zod will throw if data doesn't match expected schema
```

---

### 7. Potential Race Condition in TrainPanel Selection
**Severity**: LOW-MEDIUM  
**File**: `app/MobilityDashboard.tsx` (selectVehicle function ~685-710)

**Problem**:
Multiple rapid selections could trigger race conditions with animation state (`trainSwitchAnimationRef`).

**Required Fix**:
```typescript
const selectVehicle = useCallback((vehicleId: string, focusMap = true) => {
  const selected = vehiclesById[vehicleId];
  if (!selected) return;
  
  // Clear previous animation to prevent state inconsistency
  if (trainSwitchAnimationRef.current) {
    trainSwitchAnimationRef.current = null;
  }
  
  // Rest of logic...
}, [vehiclesById]);
```

---

## 🟢 LOW PRIORITY IMPROVEMENTS (Nice to Have)

### 8. Missing Error Boundaries
- Add React Error Boundaries for StationPanel, TrainPanel
- Gracefully handle rendering failures

### 9. Excessive Logging in Production
- Line 1301+: Debug matching visualization logs
- Should be conditional on `debugMatching` flag

### 10. Hard-coded Timeout Values
- Line 59 (ReplayPanel): `10_000` ms - no constant
- Line 73 (StationPanel): `8_000` ms - no constant
- Create named constants for clarity

### 11. Large Component File
- `MobilityDashboard.tsx` is 1700+ lines
- Consider breaking into smaller components:
  - `MapControls.tsx`
  - `VehiclePanel.tsx`  
  - `RoadEventsPanel.tsx`

### 12. TypeScript Type Safety
- Multiple `as unknown` casts should use proper type guards
- Example: Line 1384 GeoJSONSource casting

---

## 📋 CHECKLIST: Required Changes

- [ ] **Fix Date.parse() validation** in all 6 files (HIGH PRIORITY)
- [ ] **Add error logging** to catch blocks (HIGH PRIORITY)
- [ ] **Validate API responses** with schemas (MEDIUM PRIORITY)
- [ ] **Fix null reference safety** in StationPanel line 76 (MEDIUM PRIORITY)
- [ ] **Implement WebSocket sync logic** on reconnect (MEDIUM PRIORITY)
- [ ] **Add memory limits** to motion sample maps (MEDIUM PRIORITY)
- [ ] **Fix train selection race condition** (LOW-MEDIUM PRIORITY)

---

## 🧪 Testing Requirements

After fixing above issues:

1. Run existing test suite: `npm test`
2. Add new tests for:
   - Invalid date strings in timestamps
   - Network error handling (mock fetch failures)
   - WebSocket reconnection scenarios
   - Vehicle selection edge cases

3. Manual testing:
   - Open app with network throttling (DevTools)
   - Trigger connection loss/recovery
   - Select multiple vehicles rapidly
   - Verify station board updates with stale timestamps

---

## 📝 Notes

- **Do NOT edit**: Files are already being modified by another AI
- **Coordination**: Changes should be applied carefully to avoid conflicts
- **Testing**: Run full test suite after each major change group
- **Observability**: All fixes should include console logging for debugging

---

**Document Created**: 2026-09-12  
**Status**: Ready for implementation
