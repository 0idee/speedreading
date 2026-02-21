# Adaptive Reading Exercise – Elo w/ Uncertainty (Glicko-lite)

## Goal
Adaptive difficulty using a rating with uncertainty:
- User skill rating: R_user
- User uncertainty: RD_user (rating deviation)

Difficulty items have:
- Item rating: R_item (derived from length + charset complexity)
- Optional fixed item uncertainty: RD_item (can be constant)

This is a "Glicko-lite" approach: simple, stable, and reacts quickly early on.

---

## State (Persist per user/session)
- R_user (default 1000)
- RD_user (default 250)  // high uncertainty initially
- attempts_count
- rolling window accuracy (last N=10)

Clamps:
- R_user ∈ [600, 1800]
- RD_user ∈ [60, 350]

---

## Attempt Outcome
Binary scoring:
- S = 1 if the typed string is perfectly correct
- S = 0 otherwise

(Partial credit can be added later; baseline is binary.)

---

## Expected Success Probability (with uncertainty)
Use a softened logistic based on combined deviation.

Define:
- RD_item = 80 (constant; configurable)
- RD_combined = sqrt(RD_user^2 + RD_item^2)

Convert deviation to a scaling factor g in (0,1]:
- g = 1 / sqrt(1 + (3 * (RD_combined^2)) / (pi^2 * 400^2))

Expected score:
- E = 1 / (1 + 10^( g * (R_item - R_user) / 400 ))

Intuition:
- If uncertainty is high, g decreases -> E becomes less extreme -> safer updates.

---

## Update Rules (Rating + Deviation)

### Rating update
Use a variable K that depends on RD_user:
- K_base = 24
- K = K_base * (RD_user / 200)   // higher RD => larger K
Clamp K to [12, 40].

Update:
- R_user' = R_user + K * (S - E)

### Deviation update (uncertainty shrink / grow)
We want RD_user to:
- shrink when behavior is consistent
- grow slightly if performance is volatile or after long inactivity

Simple per-attempt shrink:
- RD_user' = max(RD_min, RD_user * shrink)
where shrink depends on surprise |S - E|:

- surprise = abs(S - E)     // in [0,1]
- shrink = 0.97 + 0.03 * surprise
  - if surprise small (~0), shrink ~0.97 (RD decreases faster)
  - if surprise large (~1), shrink ~1.00 (RD barely decreases)

Optional volatility bump (to avoid overconfidence on noisy performance):
- Maintain rolling accuracy over last N=10
- If rolling accuracy oscillates strongly (e.g., stddev high) then:
  RD_user' = min(RD_max, RD_user' + 10)

Optional inactivity:
- On session start, if last_played > 7 days:
  RD_user = min(RD_max, RD_user + 30)

---

## Item Rating Mapping (length + charset)

### Character Set Complexity Weights
Weights for enabled categories:
- numbers (0-9)           w_num = 1.00
- lowercase letters (a-z) w_low = 1.05
- uppercase letters (A-Z) w_up  = 1.12
- punctuation             w_pun = 1.25

Charset multiplier:
- M_charset = average(weights of enabled categories)

### Length contribution
- L = string length
- L0 = 4
- R_base = 1000
- slope_per_char = 55  // points per char above L0

R_len = R_base + slope_per_char * (L - L0)

### Charset term
- charset_scale = 400
R_charset = charset_scale * (M_charset - 1.0)

### Final
R_item = R_len + R_charset

Clamp L ∈ [2, 14] (configurable).

---

## Choosing Next Difficulty (with margin-of-error)

### Target success rate and safety margin
Base target:
- p_target = 0.75

Convert to target rating:
- R_target = R_user - 400 * log10((1/p_target) - 1)

Now apply a safety margin based on uncertainty:
- margin = m_factor * RD_user
- m_factor = 0.20 (default)

Effective target:
- R_target_eff = R_target - margin

Meaning:
- when uncertain (RD high), we pick slightly easier items
- as certainty improves (RD shrinks), margin shrinks automatically

### Candidate selection (deterministic)
At each attempt:
1) Compute R_target_eff.
2) Generate candidates around current settings:
   - lengths: L_current-1, L_current, L_current+1 (within clamps)
   - charset modes: current mode + neighbors (optional, see below)
3) For each candidate, compute R_item.
4) Choose candidate minimizing |R_item - R_target_eff|.

Tie-breakers:
1) prefer same charset mode
2) prefer smaller length change (0 then ±1)
3) prefer lower difficulty

### Charset mode transitions (optional, for stability)
Define discrete modes:
A numbers
B lowercase
C lowercase+numbers
D lower+upper
E lower+upper+numbers
F all incl punctuation

Allow transitions only to adjacent modes unless user overrides.

---

## Anti-oscillation & fatigue handling
- Rolling window N=10.
- If rolling accuracy < 0.45:
  temporarily set p_target = 0.85 and increase margin by +10% for next 5 attempts
- If rolling accuracy > 0.90:
  temporarily set p_target = 0.70 for next 5 attempts (no margin change)

Do not change charset mode more than once every 5 attempts (unless user changes it).

Length may change every attempt.

---

## Implementation Requirements
- Rating logic must be pure (UI-free), deterministic.
- Persist {R_user, RD_user, attempts_count, last_played, rolling window} in local storage.
- Provide unit tests:
  - E decreases as R_item increases
  - Win increases R_user more when RD_user is high
  - RD_user shrinks faster when surprise is low
  - Selection moves R_item toward R_target_eff
  - Clamps enforced