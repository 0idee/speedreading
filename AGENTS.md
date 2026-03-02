# AGENTS.md — Exercise Specs & Adaptive Difficulty

Questo file è la “source of truth” per la logica di adattamento difficoltà.
Per ogni esercizio definisce:
- stato da salvare nel profilo
- regole di progressione (in base alla bravura dell’utente)
- vincoli di generazione degli stimoli
- requisiti di test e architettura

---

## 0) Regole comuni (valgono per tutti gli esercizi)

### 0.1 Architettura obbligatoria (separazione logica/UI)
Ogni esercizio deve separare in moduli testabili e UI-free:
- generator: crea gli stimoli (stringhe/target/scene)
- evaluator: valuta risposta/risultato e produce S∈[0,1]
- progression: aggiorna la difficoltà (stato) in modo deterministico
- persistence: carica/salva lo stato nel profilo utente

### 0.2 Persistenza profilo (DB se possibile, fallback localStorage)
Ogni esercizio salva in profilo (o fallback localStorage) almeno:
- current (stato/difficoltà corrente)
- best (record)
- lastSessionAt
- rollingResults (ultimi 10 tentativi: es. [{S, meta...}])

Se c’è un modello UserProfile/DB: usare quello.
Fallback consentito: localStorage con chiave stabile (userId + exerciseId).

### 0.3 Anti-oscillazione / fatica (rolling window)
Rolling window N=10.
- Se accuracy < 0.45: rendere temporaneamente più facile per 5 tentativi
- Se accuracy > 0.90: rendere temporaneamente più difficile (con step piccoli) per 5 tentativi
Cooldown generale:
- dopo un cambio di difficoltà, non cambiare di nuovo per 1 tentativo

### 0.4 Convenzioni caratteri (leggibilità)
Per evitare ambiguità:
- Per “Campo Visivo” è OBBLIGATORIO: non usare 'O' né 'o' (lo '0' resta ammesso).
- In altri esercizi, eventuali esclusioni di caratteri ambigui devono essere documentate e testate.

### 0.5 Scoring S ∈ [0,1]
Dove possibile usare S continuo:
- 1.0 = perfetto
- 0.0 = fallimento
Esempio: percentuale caratteri corretti, oppure percentuale tempo in fissazione.
Se non disponibile, usare S binario {0,1}.

---

## 1) Modello adattivo di riferimento (Glicko-lite: rating + incertezza)

Questo modello si usa per gli esercizi dove la difficoltà è multi-parametro e non a “stage rigidi”
(es: Lettura veloce, Punti di fissità).

### 1.1 Stato
- R_user (default 1000)
- RD_user (default 250)
- attempts_count
- rolling accuracy (N=10)
Clamps:
- R_user ∈ [600, 1800]
- RD_user ∈ [60, 350]

### 1.2 Expected score
- RD_item = 80 (costante)
- RD_combined = sqrt(RD_user^2 + RD_item^2)
- g = 1 / sqrt(1 + (3 * (RD_combined^2)) / (pi^2 * 400^2))
- E = 1 / (1 + 10^( g * (R_item - R_user) / 400 ))

### 1.3 Update rating
K dinamico:
- K_base = 24
- K = clamp(12, 40, K_base * (RD_user / 200))
Update:
- R_user' = R_user + K * (S - E)

### 1.4 Update incertezza (RD)
- surprise = abs(S - E)
- shrink = 0.97 + 0.03 * surprise
- RD_user' = max(RD_min, RD_user * shrink)

Volatilità (opzionale, se oscillazioni forti):
- se rolling performance molto instabile: RD_user' = min(RD_max, RD_user' + 10)

Inattività:
- se lastSessionAt > 7 giorni: RD_user = min(RD_max, RD_user + 30)

### 1.5 Selezione difficoltà con “margine”
Target:
- p_target = 0.75
R_target:
- R_target = R_user - 400 * log10((1/p_target) - 1)
Margine (sicurezza):
- R_target_eff = R_target - 0.20 * RD_user
Scegli i parametri dell’esercizio tali che R_item sia più vicino a R_target_eff,
con candidati locali (step piccoli) e tie-break:
1) minima variazione rispetto al tentativo precedente
2) preferire più facile se pari (riduce frustrazione)

---

## 2) Esercizio: Campo Visivo (stage rigidi, nessuna scelta utente)

### 2.1 Spec generale
- Nessun toggle/setting utente per charset o difficoltà.
- Progressione fissa a stage.
- Lunghezza iniziale L=4, min 4, max 14.

### 2.2 Stage e charset
Stage 1: numeri `0-9`
Stage 2: numeri + `A-Z` senza `O`
Stage 3: numeri + `A-Z` (senza `O`) + `a-z` (senza `o`)
Stage 4: stage 3 + speciali stabili:
`. , ; : ! ? - _ ( ) [ ] { } / \ @ # $ % & * + =`

Vincoli obbligatori:
- Non usare 'O' né 'o'
- '0' ammesso

### 2.3 Progressione lunghezza (dentro stage)
- Aumenta di +1 dopo 3 successi consecutivi
- Su errore diminuisci di -1 (min 4)
- Cooldown: dopo un cambio di lunghezza, non cambiare di nuovo per 1 tentativo

### 2.4 Promozione stage
Con L>=10:
- promuovi stage se l’utente completa due volte consecutive la streak da 3 mentre L è almeno 10
Al cambio stage:
- applica buffer: L = max(4, L - 2)

### 2.5 Stato e persistenza (Campo Visivo)
Salvare:
- currentStage (1..4)
- currentLength (4..14)
- bestStageReached
- bestLengthReached
- lastSessionAt
- rollingResults (ultimi 10 con almeno S e {stage, L})

All’avvio sessione:
- riparti da currentStage/currentLength
- se assenti: stage=1, L=4

---

## 3) Esercizio: Lettura veloce (adattivo con Glicko-lite)

### 3.1 Obiettivo
Adattare la difficoltà in base alla bravura su:
- velocità di esposizione (ms)  [più basso = più difficile]
- dimensione stimolo (caratteri o parole) [più alto = più difficile]
- complessità testo (opzionale) [punteggio 1.0..1.5]

L’utente non seleziona la difficoltà: si adatta automaticamente.
(Se esistono set/“modalità”, sono solo per tipo di esercizio, non per rendere più facile.)

### 3.2 Stato (profilo)
- R_user, RD_user, attempts_count
- currentParams: {exposureMs, stimulusSize, complexity}
- bestParams (record “più difficile”)
- lastSessionAt, rollingResults

### 3.3 Scoring
Preferito: S continuo [0,1]
Esempi accettati:
- S = percentuale caratteri corretti (matching)
- S = 1 - normalized edit distance
Fallback:
- S binario (1 se perfetto, 0 altrimenti)

### 3.4 R_item (rating della difficoltà) — mapping semplice e stabile
R_item = 1000
  + a * (stimulusSize - size0)
  + b * (complexity - 1.0)
  + c * (ms0 - exposureMs)

Default suggeriti:
- size0 = 8 caratteri (o 2 parole, se a parole)
- ms0 = 250
- a = 40
- b = 300
- c = 1.2

### 3.5 Selezione prossima difficoltà
Usare il modello (sezione 1.5):
- p_target=0.75
- R_target_eff = R_target - 0.20*RD_user
Generare candidati locali:
- exposureMs: ±25ms (clamp es. [80..600])
- stimulusSize: ±1 (clamp es. [4..20])
- complexity: step piccoli (es. ±0.05) se usata
Scegli candidato con |R_item - R_target_eff| minimo, tie-break:
1) modifica più piccola
2) preferire più facile se pari

### 3.6 Anti-fatica specifico
Se rolling accuracy < 0.45:
- aumentare exposureMs di +50 (fino a clamp)
- e/o ridurre stimulusSize di -1
per 5 tentativi
Se rolling accuracy > 0.90:
- ridurre exposureMs di -25 o aumentare size di +1 con moderazione

---

## 4) Esercizio: Punti di fissità (adattivo con Glicko-lite)

### 4.1 Obiettivo
Allenare la fissazione: mantenere lo sguardo/attenzione su un punto target.
Adattare parametri:
- holdMs (durata richiesta)
- targetSizePx (più piccolo = più difficile)
- distractorCount (più distrattori = più difficile)
- distractorAmplitude (distanza/ampiezza)
- optional: distractorMotion (0/1)

### 4.2 Stato (profilo)
- R_user, RD_user, attempts_count
- currentParams: {holdMs, targetSizePx, distractorCount, amplitude, motionFlag}
- bestParams
- lastSessionAt, rollingResults

### 4.3 Scoring
Preferito:
- S = clamp(0,1, timeOnTarget / requiredTime)
Fallback:
- S binario (1 se completato, 0 se fallito)

### 4.4 R_item (mapping)
R_item = 1000
  + a * (holdMs - hold0)/100
  + b * (size0 - targetSizePx)/5
  + c * (distractorCount - d0)
  + d * (amplitude - amp0)
  + e * motionFlag

Default:
- hold0=600ms, size0=24px, d0=2, amp0=1.0
- a=35, b=25, c=40, d=80, e=120

### 4.5 Selezione prossima difficoltà
Usare sezione 1.5 (target + margine RD).
Candidati locali (step piccoli):
- holdMs: ±100 (clamp es. [300..2000])
- targetSizePx: ±2 (clamp es. [10..40])
- distractorCount: ±1 (clamp es. [0..8])
- amplitude: ±0.1 (clamp es. [0.5..2.0])
- motionFlag: cambia solo ogni 5 tentativi (stabilità)

### 4.6 Anti-fatica specifico
Se rolling accuracy < 0.45 (per 5 tentativi):
- aumentare targetSizePx
- ridurre distractorCount
- ridurre amplitude
Se rolling accuracy > 0.90:
- ridurre targetSize o aumentare holdMs con step piccoli

### 4.7 Modalità testo e continuità giro
Nel mode `text`:
- il segmento testuale deve essere nascosto di default
- il segmento si rende visibile solo nella cella attiva (quando la barretta gialla è illuminata)

Continuità temporale intra-sessione:
- a fine giro completo della griglia, il successivo parte automaticamente
- riduzione velocità: `holdMs` diminuisce di 50ms per giro (clamp minimo UI/app)

---

## 5) Requisiti di test (obbligatori)
Aggiungere unit test per:
- Campo Visivo:
  - esclusione 'O' e 'o'
  - progressione L con streak/errore + cooldown
  - promozione stage e buffer L-2
  - persistenza stage/L e ripartenza
- Glicko-lite:
  - monotonicità E con R_item
  - update R_user direzione corretta (win/loss)
  - RD shrink con surprise basso
  - selezione candidato più vicino a R_target_eff
- Generator/Evaluator: determinismo (con seed se usato) e clamps

---

## 6) Note operative per Codex
Quando cambi comportamento:
1) aggiorna prima questo file (spec)
2) poi implementa codice coerente
3) aggiungi/aggiorna test
4) aggiorna README solo a livello utente (non duplicare tutte le formule)
