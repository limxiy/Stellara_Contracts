# Circuit Breaker & Emergency Recovery Guide

## Overview
The Stellara network implements a multi-layered Circuit Breaker pattern to protect the protocol during security incidents or anomalous market conditions. 

The system provides three levels of protection:
1.  **Manual Full Pause**: Administrative control to halt all protocol operations.
2.  **Partial Pause**: Disabling specific high-risk functions while maintaining others (e.g., stopping trades but allowing withdrawals/stats).
3.  **Automatic Circuit Breaker**: Threshold-based triggers that automatically halt operations when volume or transaction frequency exceeds safe limits.

## Automatic Triggers
The Circuit Breaker monitors two primary metrics over a rolling period (`period_duration`):
-   **Volume Threshold**: `max_volume_per_period`
-   **Transaction Count**: `max_tx_count_per_period`

If either threshold is exceeded, the contract automatically enters **Full Pause** mode.

### Event Monitoring
When the circuit breaker is triggered autonomously, it emits a `cb_trig` event:
-   **Topic**: `cb_trig`
-   **Data**: `(current_period_volume, current_period_tx_count)`

## Recovery Procedures

### 1. Verification
Before unpausing, administrators must:
- [ ] Review the `cb_trig` event data to understand what threshold was breached.
- [ ] Investigate potential security incidents or market manipulation attempt.
- [ ] Verify that the anomalous activity has ceased or was a false positive.

### 2. Manual Unpausing (Full Reset)
To resume full operations after an automatic or manual pause, an Admin must call:
`set_pause_level(adminAddress, PauseLevel::None)`

### 3. Graduated Recovery
For a safer recovery, admins can use a graduated approach:
1.  Move from `Full` to `Partial` pause.
2.  `unpause_function(admin, symbol_short!("withdraw"))` - Enable withdrawals first.
3.  Observe for a period.
4.  `unpause_function(admin, symbol_short!("trade"))` - Re-enable trading.
5.  `set_cb_config(admin, new_config)` - Adjust thresholds if they were too sensitive.

## Administrative Functions

| Function | Authority | Description |
| :------- | :-------- | :---------- |
| `set_pause_level` | Admin | Set global pause state (None, Partial, Full) |
| `pause_function` | Admin | Disable a specific function by name |
| `unpause_function` | Admin | Re-enable a specific function |
| `get_cb_state` | Public | View current pause level and period stats |
| `get_cb_config` | Public | View current threshold configurations |

## Error Codes
- `CONTRACT_FULLY_PAUSED`: Global pause active.
- `FUNCTION_PAUSED`: Specific function call attempted while paused.
- `UNAUTH`: Unauthorized call (only Admin can manage CB).
